import { Server as HTTPServer } from 'http'
import jwt from 'jsonwebtoken'
import { Server, Socket } from 'socket.io'

interface ClientToServerEvents {
    createRoom: () => void
    getRooms: () => void
    joinRoom: (data: { roomId: string }) => void
    message: (data: { roomId: string; message: string }) => void
}

interface ServerToClientEvents {
    welcome: (message: string) => void
    roomCreated: (data: { roomId: number }) => void
    roomsList: (rooms: Room[]) => void
    roomUpdate: (room: Room) => void
    message: (data: { username: string; message: string }) => void
    errorMessage: (message: string) => void
}

interface UserData {
    userId: number
    email: string
}

interface Room {
    id: number
    players: string[]
}

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>

export class ChatServer {
    private io: TypedServer
    private rooms = new Map<number, Room>()
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

            if (!token) {
                return next(new Error('Token manquant'))
            }

            try {
                const decoded = jwt.verify(
                    token,
                    process.env.JWT_SECRET as string
                ) as UserData

                socket.data.userId = decoded.userId
                socket.data.email = decoded.email

                next()
            } catch {
                next(new Error('Token invalide ou expiré'))
            }
        })
    }

    private initializeSocket() {
        this.io.on('connection', (socket: TypedSocket) => {
            const { email } = socket.data as UserData

            console.log(`Connexion acceptée: ${email}`)

            socket.emit('welcome', `Bienvenue ${email}!`)

            socket.on('createRoom', () => {
                const roomId = this.roomCounter++

                const newRoom: Room = {
                    id: roomId,
                    players: [email],
                }

                this.rooms.set(roomId, newRoom)

                socket.join(String(roomId))

                socket.emit('roomCreated', { roomId })

                console.log(`${email} created room ${roomId}`)
            })

            socket.on('getRooms', () => {
                socket.emit('roomsList', Array.from(this.rooms.values()))
            })

            socket.on('joinRoom', (data) => {
                const roomId = Number(data.roomId)
                const room = this.rooms.get(roomId)

                if (!room) {
                    return socket.emit('errorMessage', 'Room not found')
                }

                if (room.players.includes(email)) {
                    return
                }

                room.players.push(email)

                socket.join(String(roomId))

                this.io.to(String(roomId)).emit('roomUpdate', room)

                console.log(`${email} joined room ${roomId}`)
            })

            socket.on('message', (data) => {
                const roomId = Number(data.roomId)

                if (!this.rooms.has(roomId)) {
                    return socket.emit('errorMessage', 'Room not found')
                }

                this.io.to(String(roomId)).emit('message', {
                    username: email,
                    message: data.message,
                })
            })

            socket.on('disconnect', () => {
                console.log(`${email} disconnected`)

                this.rooms.forEach((room, roomId) => {
                    if (room.players.includes(email)) {
                        room.players = room.players.filter(p => p !== email)

                        this.io.to(String(roomId)).emit('roomUpdate', room)

                        if (room.players.length === 0) {
                            this.rooms.delete(roomId)
                            console.log(`Room ${roomId} deleted`)
                        }
                    }
                })
            })
        })
    }
}