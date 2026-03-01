import { Server as HTTPServer } from 'http'
import jwt from 'jsonwebtoken'
import { Server, Socket } from 'socket.io'
import { prisma } from '../../src/database'

interface ClientToServerEvents {
    createRoom: (data: { deckId: number }) => void
    getRooms: () => void
    joinRoom: (data: { roomId: number; deckId: number }) => void
}

interface ServerToClientEvents {
    welcome: (message: string) => void
    roomCreated: (room: { roomId: number }) => void
    roomsListUpdated: (rooms: any[]) => void
    gameStarted: (gameState: any) => void
    errorMessage: (message: string) => void
}

interface UserData {
    userId: number
    email: string
}

interface Player {
    userId: number
    email: string
    socketId: string
    deckId: number
}

interface MatchmakingRoom {
    id: number
    host: Player
    guest?: Player
    status: 'waiting' | 'playing'
}

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>

export class ChatServer {
    private io: TypedServer
    private rooms = new Map<number, MatchmakingRoom>()
    private roomCounter = 1

    constructor(httpServer: HTTPServer) {
        this.io = new Server(httpServer, {
            cors: { origin: '*' },
        })

        this.setupAuthMiddleware()
        this.initializeSocket()
    }

    private setupAuthMiddleware() {
        this.io.use((socket, next) => {
            const token = socket.handshake.auth?.token

            if (!token)
                return next(new Error('Token manquant'))

            try {
                const decoded = jwt.verify(
                    token,
                    process.env.JWT_SECRET as string
                ) as UserData

                socket.data.userId = decoded.userId
                socket.data.email = decoded.email

                next()
            } catch {
                next(new Error('Token invalide'))
            }
        })
    }

    private async validateDeck(userId: number, deckId: number) {
        const deck = await prisma.deck.findUnique({
            where: { id: deckId },
            include: {
                deckCard: true,
            },
        })

        if (!deck)
            throw new Error('Deck introuvable')

        if (deck.userId !== userId)
            throw new Error("Ce deck ne t'appartient pas")

        if (deck.deckCard.length !== 10)
            throw new Error('Deck invalide (10 cartes requises)')
    }

    private broadcastRooms() {
        const waitingRooms = Array.from(this.rooms.values())
            .filter(r => r.status === 'waiting')
            .map(r => ({
                id: r.id,
                host: r.host.email,
            }))

        this.io.emit('roomsListUpdated', waitingRooms)
    }

    private async startGame(room: MatchmakingRoom) {
        const hostSocket = this.io.sockets.sockets.get(room.host.socketId)
        const guestSocket = this.io.sockets.sockets.get(room.guest!.socketId)

        const hostDeck = await prisma.deckCard.findMany({
            where: { deckId: room.host.deckId },
            include: { card: true },
        })

        const guestDeck = await prisma.deckCard.findMany({
            where: { deckId: room.guest!.deckId },
            include: { card: true },
        })

        const shuffle = (array: any[]) =>
            array.sort(() => Math.random() - 0.5)

        const hostCards = shuffle(hostDeck)
        const guestCards = shuffle(guestDeck)

        const hostHand = hostCards.slice(0, 5)
        const guestHand = guestCards.slice(0, 5)

        const hostState = {
            you: room.host.email,
            opponent: room.guest!.email,
            yourHand: hostHand.map(c => c.card),
            opponentHandCount: guestHand.length, // caché
        }

        const guestState = {
            you: room.guest!.email,
            opponent: room.host.email,
            yourHand: guestHand.map(c => c.card),
            opponentHandCount: hostHand.length,
        }

        hostSocket?.emit('gameStarted', hostState)
        guestSocket?.emit('gameStarted', guestState)

        this.rooms.delete(room.id)
        this.broadcastRooms()
    }

    private initializeSocket() {
        this.io.on('connection', (socket: TypedSocket) => {
            const { userId, email } = socket.data as UserData

            console.log(`Connexion acceptée: ${email}`)
            socket.emit('welcome', `Bienvenue ${email}!`)

            socket.on('createRoom', async (data): Promise<void> => {
                try {
                    const deckId = Number(data.deckId)

                    if (isNaN(deckId)) {
                        socket.emit('errorMessage', 'DeckId invalide')
                        return
                    }

                    await this.validateDeck(userId, deckId)

                    const player: Player = {
                        userId,
                        email,
                        socketId: socket.id,
                        deckId,
                    }

                    const room: MatchmakingRoom = {
                        id: this.roomCounter++,
                        host: player,
                        status: 'waiting',
                    }

                    this.rooms.set(room.id, room)

                    socket.join(String(room.id))

                    socket.emit('roomCreated', { roomId: room.id })

                    this.broadcastRooms()
                } catch (err: any) {
                    socket.emit('errorMessage', err.message)
                    return
                }
            })

            socket.on('getRooms', () => {
                this.broadcastRooms()
            })

            socket.on('joinRoom', async (data): Promise<void> => {
                try {
                    const roomId = Number(data.roomId)
                    const deckId = Number(data.deckId)

                    if (isNaN(roomId) || isNaN(deckId)) {
                        socket.emit('errorMessage', 'Paramètres invalides')
                        return
                    }

                    const room = this.rooms.get(roomId)

                    if (!room) {
                        socket.emit('errorMessage', 'Room not found')
                        return
                    }

                    if (room.guest) {
                        socket.emit('errorMessage', 'Room full')
                        return
                    }

                    await this.validateDeck(userId, deckId)

                    room.guest = {
                        userId,
                        email,
                        socketId: socket.id,
                        deckId,
                    }

                    socket.join(String(room.id))

                    room.status = 'playing'

                    await this.startGame(room)
                } catch (err: any) {
                    socket.emit('errorMessage', err.message)
                    return
                }
            })

            socket.on('disconnect', () => {
                console.log(`${email} disconnected`)
            })
        })
    }
}