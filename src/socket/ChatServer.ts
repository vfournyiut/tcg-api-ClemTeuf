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

    private startGame(room: MatchmakingRoom) {
        const hostSocket = this.io.sockets.sockets.get(room.host.socketId)
        const guestSocket = this.io.sockets.sockets.get(
            room.guest!.socketId
        )

        const hostState = {
            you: room.host.email,
            opponent: room.guest!.email,
        }

        const guestState = {
            you: room.guest!.email,
            opponent: room.host.email,
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

            socket.on('createRoom', async (data) => {
                try {
                    const deckId = Number(data.deckId)

                    if (isNaN(deckId))
                        return socket.emit('errorMessage', 'DeckId invalide')

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
                }
            })

            socket.on('getRooms', () => {
                this.broadcastRooms()
            })
            socket.on('joinRoom', async (data) => {
                try {
                    const roomId = Number(data.roomId)
                    const deckId = Number(data.deckId)

                    if (isNaN(roomId) || isNaN(deckId))
                        return socket.emit('errorMessage', 'Paramètres invalides')

                    const room = this.rooms.get(roomId)

                    if (!room)
                        return socket.emit('errorMessage', 'Room not found')

                    if (room.guest)
                        return socket.emit('errorMessage', 'Room full')

                    await this.validateDeck(userId, deckId)

                    room.guest = {
                        userId,
                        email,
                        socketId: socket.id,
                        deckId,
                    }

                    socket.join(String(room.id))

                    room.status = 'playing'

                    this.startGame(room)
                } catch (err: any) {
                    socket.emit('errorMessage', err.message)
                }
            })

            socket.on('disconnect', () => {
                console.log(`${email} disconnected`)
            })
        })
    }
}