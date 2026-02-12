import { Request, Response, Router } from 'express'
import { prisma } from "../src/database"
import { authentificateToken } from './auth.middleware'

export const decksMineRouter = Router()

/**
 * Récupère tous les decks appartenant à l'utilisateur authentifié.
 *
 * @route GET /api/decks/mine
 *
 * @returns {200} Liste des decks avec leurs cartes.
 * @returns {401} Si l'utilisateur n'est pas authentifié.
 * @returns {500} En cas d'erreur serveur.
 *
 * @throws {Error} Si la récupération des decks échoue.
 */
decksMineRouter.get('/api/decks/mine', authentificateToken, async (req: Request, res: Response) => {
    try {
        // Vérification du token
        if (!req.user) {
            return res.status(401).json({ error: 'Token manquant ou invalide.' })
        }

        // Récupérer tous les decks de l'utilisateur avec les cartes
        const decks = await prisma.deck.findMany({
            where: { userId: req.user.userId },
            include: {
                deckCard: {
                    include: { card: true }
                }
            }
        })

        return res.status(200).json(decks)
    } catch (error) {
        console.error('Erreur lors de la récupération des decks :', error)
        return res.status(500).json({ error: 'Erreur serveur.' })
    }
})