import { Server as HTTPServer } from 'http'
import jwt from 'jsonwebtoken'
import { Server, Socket } from 'socket.io'
import { prisma } from '../../src/database'
import { calculateDamage } from '../../src/utils/rules.util'

interface ClientToServerEvents {
    createRoom: (data: { deckId: number }) => void
    getRooms: () => void
    joinRoom: (data: { roomId: number; deckId: number }) => void
    drawCards: () => void
    playCard: (data: { cardIndex: number }) => void
    attack: () => void
    endTurn: (data: { roomId: number }) => void
}

interface ServerToClientEvents {
    welcome: (message: string) => void
    roomCreated: (room: { roomId: number }) => void
    roomsListUpdated: (rooms: any[]) => void
    gameStarted: (gameState: any) => void
    gameStateUpdated: (gameState: any) => void
    gameEnded: (result: { winner: string; loser: string; message: string }) => void
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

interface CardInGame {
    id: number
    name: string
    hp: number
    maxHp: number
    attack: number
    type: string
}

interface PlayerGameState {
    socketId: string
    email: string
    hand: CardInGame[]
    deck: CardInGame[]
    activeCard: CardInGame | null
    score: number
}

interface GameState {
    roomId: number
    players: [PlayerGameState, PlayerGameState]
    currentPlayerSocketId: string
}

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>

function buildHpBar(hp: number, maxHp: number): string {
    const ratio = Math.max(0, hp / maxHp)
    const filled = Math.round(ratio * 10)
    const empty = 10 - filled
    const bar = ''.repeat(filled) + ''.repeat(empty)
    const pct = Math.round(ratio * 100)
    return `[${bar}] ${hp}/${maxHp} HP (${pct}%)`
}

export class ChatServer {
    private io: TypedServer
    private rooms = new Map<number, MatchmakingRoom>()
    private games = new Map<number, GameState>()
    private roomCounter = 1

    constructor(httpServer: HTTPServer) {
        this.io = new Server(httpServer, { cors: { origin: '*' } })
        this.setupAuthMiddleware()
        this.initializeSocket()
    }

    private setupAuthMiddleware() {
        this.io.use((socket, next) => {
            const token = socket.handshake.auth?.token
            if (!token) return next(new Error('Token manquant'))
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as UserData
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
            include: { deckCard: true },
        })
        if (!deck) throw new Error('Deck introuvable')
        if (deck.userId !== userId) throw new Error("Ce deck ne t'appartient pas")
        if (deck.deckCard.length !== 10) throw new Error('Deck invalide (10 cartes requises)')
    }

    private broadcastRooms() {
        const waitingRooms = Array.from(this.rooms.values())
            .filter(r => r.status === 'waiting')
            .map(r => ({ id: r.id, host: r.host.email }))
        this.io.emit('roomsListUpdated', waitingRooms)
    }

    private buildPlayerView(game: GameState, playerSocketId: string): any {
        const [p0, p1] = game.players
        const isP0 = p0.socketId === playerSocketId
        const me = isP0 ? p0 : p1
        const opp = isP0 ? p1 : p0
        const isMyTurn = game.currentPlayerSocketId === playerSocketId

        const actionsDisponibles: string[] = []
        const actionsImpossibles: { action: string; raison: string }[] = []

        if (isMyTurn) {
            if (me.deck.length === 0) {
                actionsImpossibles.push({ action: 'drawCards', raison: 'Deck vide' })
            } else if (me.hand.length >= 5) {
                actionsImpossibles.push({ action: 'drawCards', raison: `Main pleine (${me.hand.length}/5)` })
            } else {
                actionsDisponibles.push(`drawCards — Piocher jusqu'à ${5 - me.hand.length} carte(s) (main : ${me.hand.length}/5)`)
            }

            if (me.activeCard) {
                actionsImpossibles.push({ action: 'playCard', raison: `"${me.activeCard.name}" est déjà sur le terrain` })
            } else if (me.hand.length === 0) {
                actionsImpossibles.push({ action: 'playCard', raison: 'Aucune carte en main' })
            } else {
                actionsDisponibles.push(`playCard { cardIndex: 0..${me.hand.length - 1} } — Poser une carte sur le terrain`)
            }

            if (!me.activeCard) {
                actionsImpossibles.push({ action: 'attack', raison: 'Aucune carte active sur votre terrain' })
            } else if (!opp.activeCard) {
                actionsImpossibles.push({ action: 'attack', raison: "L'adversaire n'a pas de carte active" })
            } else {
                const dmg = me.activeCard.attack
                actionsDisponibles.push(
                    `attack — Attaquer "${opp.activeCard.name}" avec "${me.activeCard.name}" (${dmg} dégâts, ou ${dmg * 2} si faiblesse de type)`)
            }

            actionsDisponibles.push(`endTurn — Terminer le tour et passer la main à ${opp.email}`)
        }

        const mainFormatee = me.hand.map((card, index) => ({
            index,
            nom: card.name,
            type: card.type,
            hp: `${card.hp}/${card.maxHp}`,
            attaque: card.attack,
            commande: `playCard { cardIndex: ${index} }`,
        }))

        const formatTerrain = (card: CardInGame | null) => {
            if (!card) return '(aucune carte)'
            return {
                nom: card.name,
                type: card.type,
                attaque: card.attack,
                vie: buildHpBar(card.hp, card.maxHp),
            }
        }

        return {
            statut: isMyTurn ? "C'EST VOTRE TOUR" : `Tour de ${opp.email} — attendez...`,
            isVotreTour: isMyTurn,

            objectif: `Mettez KO 3 cartes adverses pour gagner. Score : vous ${me.score}/3 — ${opp.email} ${opp.score}/3`,

            vous: {
                email: me.email,
                score: me.score,
                deck: `${me.deck.length} carte(s) restante(s)`,
                main: mainFormatee.length > 0 ? mainFormatee : '(main vide)',
                terrain: formatTerrain(me.activeCard),
            },

            adversaire: {
                email: opp.email,
                score: opp.score,
                deck: `${opp.deck.length} carte(s) restante(s)`,
                main: `${opp.hand.length} carte(s) en main (cachées)`,
                terrain: formatTerrain(opp.activeCard),
            },

            ...(isMyTurn
                ? { actionsDisponibles, actionsImpossibles }
                : { message: `Attendez que ${opp.email} termine son tour.` }
            ),
        }
    }

    private emitGameState(game: GameState) {
        for (const player of game.players) {
            const socket = this.io.sockets.sockets.get(player.socketId)
            socket?.emit('gameStateUpdated', this.buildPlayerView(game, player.socketId))
        }
    }

    private getGameAndPlayer(socket: TypedSocket): { game: GameState; me: PlayerGameState; opponent: PlayerGameState } | null {
        for (const game of this.games.values()) {
            const [p0, p1] = game.players
            if (p0.socketId === socket.id || p1.socketId === socket.id) {
                const isP0 = p0.socketId === socket.id
                return { game, me: isP0 ? p0 : p1, opponent: isP0 ? p1 : p0 }
            }
        }
        return null
    }

    private async startGame(room: MatchmakingRoom) {
        const hostSocket = this.io.sockets.sockets.get(room.host.socketId)
        const guestSocket = this.io.sockets.sockets.get(room.guest!.socketId)

        const loadDeck = async (deckId: number): Promise<CardInGame[]> => {
            const deckCards = await prisma.deckCard.findMany({
                where: { deckId },
                include: { card: true },
            })
            return deckCards
                .sort(() => Math.random() - 0.5)
                .map(dc => ({
                    id: dc.card.id,
                    name: dc.card.name,
                    hp: dc.card.hp,
                    maxHp: dc.card.hp,
                    attack: dc.card.attack,
                    type: dc.card.type,
                }))
        }

        const hostDeck = await loadDeck(room.host.deckId)
        const guestDeck = await loadDeck(room.guest!.deckId)

        const hostHand = hostDeck.splice(0, 5)
        const guestHand = guestDeck.splice(0, 5)

        const game: GameState = {
            roomId: room.id,
            players: [
                { socketId: room.host.socketId, email: room.host.email, hand: hostHand, deck: hostDeck, activeCard: null, score: 0 },
                { socketId: room.guest!.socketId, email: room.guest!.email, hand: guestHand, deck: guestDeck, activeCard: null, score: 0 },
            ],
            currentPlayerSocketId: room.host.socketId,
        }

        this.games.set(room.id, game)

        hostSocket?.emit('gameStarted', {
            ...this.buildPlayerView(game, room.host.socketId),
            message: "La partie commence ! Vous jouez en premier. Commencez par poser une carte (playCard) ou piocher (drawCards).",
        })
        guestSocket?.emit('gameStarted', {
            ...this.buildPlayerView(game, room.guest!.socketId),
            message: `La partie commence ! ${room.host.email} joue en premier. Attendez votre tour.`,
        })

        this.rooms.delete(room.id)
        this.broadcastRooms()
    }

    private initializeSocket() {
        this.io.on('connection', (socket: TypedSocket) => {
            const { userId, email } = socket.data as UserData
            console.log(`Connexion : ${email}`)

            socket.emit('welcome', `Bienvenue ${email} ! Créez une room (createRoom) ou rejoignez-en une (joinRoom).`)

            socket.on('createRoom', async (data): Promise<void> => {
                try {
                    const deckId = Number(data.deckId)
                    if (isNaN(deckId)) return void socket.emit('errorMessage', 'DeckId invalide')

                    await this.validateDeck(userId, deckId)

                    const player: Player = { userId, email, socketId: socket.id, deckId }
                    const room: MatchmakingRoom = { id: this.roomCounter++, host: player, status: 'waiting' }

                    this.rooms.set(room.id, room)
                    socket.join(String(room.id))
                    socket.emit('roomCreated', { roomId: room.id })
                    socket.emit('welcome' as any, `Room #${room.id} créée avec le deck #${deckId}. En attente d'un adversaire...`)
                    this.broadcastRooms()
                } catch (err: any) {
                    socket.emit('errorMessage', `${err.message}`)
                }
            })

            socket.on('getRooms', () => this.broadcastRooms())

            socket.on('joinRoom', async (data): Promise<void> => {
                try {
                    const roomId = Number(data.roomId)
                    const deckId = Number(data.deckId)
                    if (isNaN(roomId) || isNaN(deckId)) return void socket.emit('errorMessage', 'Paramètres invalides')

                    const room = this.rooms.get(roomId)
                    if (!room) return void socket.emit('errorMessage', `Room #${roomId} introuvable`)
                    if (room.guest) return void socket.emit('errorMessage', `La room #${roomId} est déjà pleine`)

                    await this.validateDeck(userId, deckId)

                    room.guest = { userId, email, socketId: socket.id, deckId }
                    socket.join(String(room.id))
                    room.status = 'playing'
                    await this.startGame(room)
                } catch (err: any) {
                    socket.emit('errorMessage', `${err.message}`)
                }
            })

            socket.on('drawCards', (): void => {
                const context = this.getGameAndPlayer(socket)
                if (!context) return void socket.emit('errorMessage', 'Aucune partie en cours')

                const { game, me } = context

                if (game.currentPlayerSocketId !== socket.id)
                    return void socket.emit('errorMessage', "Ce n'est pas votre tour")

                if (me.hand.length >= 5)
                    return void socket.emit('errorMessage', `Main déjà pleine (${me.hand.length}/5). Jouez une carte d'abord (playCard).`)

                if (me.deck.length === 0)
                    return void socket.emit('errorMessage', 'Deck vide, plus de cartes à piocher.')

                const needed = 5 - me.hand.length
                const drawn = me.deck.splice(0, needed)
                me.hand.push(...drawn)

                socket.emit('errorMessage' as any, `Vous avez pioché ${drawn.length} carte(s). Main : ${me.hand.length}/5.`)
                this.emitGameState(game)
            })

            socket.on('playCard', (data): void => {
                const context = this.getGameAndPlayer(socket)
                if (!context) return void socket.emit('errorMessage', 'Aucune partie en cours')

                const { game, me } = context

                if (game.currentPlayerSocketId !== socket.id)
                    return void socket.emit('errorMessage', "Ce n'est pas votre tour")

                if (me.activeCard)
                    return void socket.emit('errorMessage', `"${me.activeCard.name}" est déjà sur le terrain. Attaquez (attack) ou terminez votre tour (endTurn).`)

                const cardIndex = Number(data.cardIndex)
                if (isNaN(cardIndex) || cardIndex < 0 || cardIndex >= me.hand.length)
                    return void socket.emit('errorMessage', `Index invalide. Vous avez ${me.hand.length} carte(s) en main (index 0 à ${me.hand.length - 1}).`)

                const [card] = me.hand.splice(cardIndex, 1)
                me.activeCard = card

                socket.emit('errorMessage' as any, `"${card.name}" (${card.type} — ATK ${card.attack} / ${card.hp} HP) posé sur le terrain.`)
                this.emitGameState(game)
            })

            socket.on('attack', (): void => {
                const context = this.getGameAndPlayer(socket)
                if (!context) return void socket.emit('errorMessage', 'Aucune partie en cours')

                const { game, me, opponent } = context

                if (game.currentPlayerSocketId !== socket.id)
                    return void socket.emit('errorMessage', "Ce n'est pas votre tour")

                if (!me.activeCard)
                    return void socket.emit('errorMessage', "Aucune carte active sur votre terrain. Jouez une carte d'abord (playCard).")

                if (!opponent.activeCard)
                    return void socket.emit('errorMessage', "L'adversaire n'a pas de carte active. Terminez votre tour (endTurn).")

                const damage = calculateDamage(
                    me.activeCard.attack,
                    me.activeCard.type as any,
                    opponent.activeCard.type as any
                )
                const isWeakness = damage > me.activeCard.attack
                const oldHp = opponent.activeCard.hp
                opponent.activeCard.hp -= damage

                const weaknessTxt = isWeakness ? '— FAIBLESSE DE TYPE (x2) !' : ''
                socket.emit('errorMessage' as any,
                    `"${me.activeCard.name}" attaque "${opponent.activeCard.name}" : ${damage} dégâts${weaknessTxt} (${oldHp} → ${Math.max(0, opponent.activeCard.hp)} HP)`)
                const oppSocket = this.io.sockets.sockets.get(opponent.socketId)
                oppSocket?.emit('errorMessage' as any,
                    `"${me.activeCard.name}" de ${email} attaque votre "${opponent.activeCard.name}" : ${damage} dégâts${weaknessTxt} (${oldHp} → ${Math.max(0, opponent.activeCard.hp)} HP)`)

                if (opponent.activeCard.hp <= 0) {
                    const koedName = opponent.activeCard.name
                    opponent.activeCard = null
                    me.score += 1

                    socket.emit('errorMessage' as any, `"${koedName}" est KO ! +1 point. Score : ${me.score}/3`)
                    oppSocket?.emit('errorMessage' as any, `Votre "${koedName}" est KO ! Score adversaire : ${me.score}/3. Piochez et posez une nouvelle carte.`)

                    if (me.score >= 3) {
                        this.emitGameState(game)
                        for (const player of game.players) {
                            const sock = this.io.sockets.sockets.get(player.socketId)
                            sock?.emit('gameEnded', {
                                winner: me.email,
                                loser: opponent.email,
                                message: player.socketId === socket.id
                                    ? `VICTOIRE ! Vous avez mis KO 3 cartes. Félicitations !` : `DÉFAITE. ${me.email} a atteint 3 points.`,
                            })
                        }
                        this.games.delete(game.roomId)
                        return
                    }
                }

                game.currentPlayerSocketId = opponent.socketId
                socket.emit('errorMessage' as any, `Tour terminé. C'est maintenant le tour de ${opponent.email}.`)
                oppSocket?.emit('errorMessage' as any, `C'est votre tour !`)

                this.emitGameState(game)
            })

            socket.on('endTurn', (_data): void => {
                const context = this.getGameAndPlayer(socket)
                if (!context) return void socket.emit('errorMessage', 'Aucune partie en cours')

                const { game, opponent } = context

                if (game.currentPlayerSocketId !== socket.id)
                    return void socket.emit('errorMessage', "Ce n'est pas votre tour")

                game.currentPlayerSocketId = opponent.socketId

                socket.emit('errorMessage' as any, `Tour passé. C'est maintenant le tour de ${opponent.email}.`)
                const oppSocket = this.io.sockets.sockets.get(opponent.socketId)
                oppSocket?.emit('errorMessage' as any, `C'est votre tour !`)

                this.emitGameState(game)
            })

            socket.on('disconnect', () => {
                console.log(`Déconnexion : ${email}`)
                const context = this.getGameAndPlayer(socket)
                if (context) {
                    const { game, opponent } = context
                    const oppSocket = this.io.sockets.sockets.get(opponent.socketId)
                    oppSocket?.emit('gameEnded', {
                        winner: opponent.email,
                        loser: email,
                        message: `VICTOIRE par forfait ! ${email} s'est déconnecté.`,
                    })
                    this.games.delete(game.roomId)
                }
            })
        })
    }
}