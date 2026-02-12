import { Request, Response, Router } from 'express'
import { prisma } from "../src/database"
import { authentificateToken } from './auth.middleware'

export const decksGetRouter = Router()

/**
 * Récupère un deck spécifique par son identifiant.
 *
 * @route GET /api/decks/:id
 *
 * @param {number} req.params.id - Identifiant du deck.
 *
 * @returns {200} Deck trouvé avec ses cartes.
 * @returns {400} Si l'identifiant est invalide.
 * @returns {401} Si l'utilisateur n'est pas authentifié.
 * @returns {403} Si le deck appartient à un autre utilisateur.
 * @returns {404} Si le deck est introuvable.
 * @returns {500} En cas d'erreur serveur.
 *
 * @throws {Error} Si une erreur survient lors de l'accès à la base de données.
 */
decksGetRouter.get('/api/decks/:id', authentificateToken, async (req: Request, res: Response) => {
    try {
        // Vérifications
        if (!req.user) {
            return res.status(401).json({ error: 'Token manquant ou invalide.' })
        }

        const deckId = Number(req.params.id)

        if (isNaN(deckId)) {
            return res.status(400).json({ error: 'ID de deck invalide.' })
        }

        // Chercher le deck et ses cartes
        const deck = await prisma.deck.findUnique({
            where: { id: deckId },
            include: {
                deckCard: {
                    include: { card: true }
                }
            }
        })

        if (!deck) {
            return res.status(404).json({ error: 'Deck introuvable.' })
        }

        if (deck.userId !== req.user.userId) {
            return res.status(403).json({ error: 'Accès refusé à ce deck.' })
        }

        return res.status(200).json(deck);
    } catch (error) {
        console.error('Erreur lors de la récupération du deck :', error)
        return res.status(500).json({ error: 'Erreur serveur.' })
    }
})