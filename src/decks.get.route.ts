import {Request, Response, Router} from 'express'
import {prisma} from "../src/database"
import { authentificateToken } from './auth.middleware'

export const decksGetRouter = Router()

decksGetRouter.get('/api/decks/:id', authentificateToken, async (req: Request, res: Response) => {
    try {
        // Vérifications
        if(!req.user) {
            return res.status(401).json({error : 'Token manquant ou invalide.'})
        }

        const deckId = Number(req.params.id)

        if (isNaN(deckId)) {
            return res.status(400).json({error : 'ID de deck invalide.'})
        }

        // Chercher le deck et ses cartes
        const deck = await prisma.deck.findUnique({
            where: {id: deckId},
            include: {
                deckCard: {
                    include: {card: true}
                }
            }
        })

        if(!deck) {
            return res.status(404).json({error : 'Deck introuvable.'})
        }

        if(deck.userId !== req.user.userId) {
            return res.status(403).json({error : 'Accès refusé à ce deck.'})
        }

        return res.status(200).json(deck);
    } catch (error) {
        console.error('Erreur lors de la récupération du deck :', error)
        return res.status(500).json({error : 'Erreur serveur.'})
    }
})