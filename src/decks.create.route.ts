import { Request, Response, Router } from 'express'
import { prisma } from "../src/database"
import { authentificateToken } from './auth.middleware'

export const decksCreateRouter = Router()

/**
 * Crée un nouveau deck pour l'utilisateur authentifié.
 *
 * @route POST /api/decks
 *
 * @param {string} req.body.name - Nom du deck à créer.
 * @param {number[]} req.body.cards - Liste des identifiants des 10 cartes du deck.
 *
 * @returns {201} Deck créé avec ses cartes associées.
 * @returns {400} Si le nom est manquant ou si le nombre de cartes est différent de 10.
 * @returns {401} Si l'utilisateur n'est pas authentifié.
 * @returns {500} En cas d'erreur serveur.
 *
 * @throws {Error} Si une erreur survient lors de l'accès à la base de données.
 */
decksCreateRouter.post('/api/decks', authentificateToken, async (req: Request, res: Response) => {
    try {
        const { name, cards } = req.body

        // Vérifications de base
        if (!req.user) {
            return res.status(401).json({ error: 'Token manquant ou invalide.' })
        }

        if (!name) {
            return res.status(400).json({ error: 'Nom du deck obligatoire.' })
        }

        if (!Array.isArray(cards) || cards.length !== 10) {
            return res.status(400).json({ error: 'Un deck doit contenir 10 cartes.' })
        }

        // Vérifier l'existence des cartes
        const existingCards = await prisma.card.findMany({
            where: { id: { in: cards } }
        })

        if (existingCards.length !== 10) {
            return res.status(400).json({ error: 'Certaines cartes sont invalides ou inexistantes.' })
        }

        // Créer le deck
        const deck = await prisma.deck.create({
            data: {
                name,
                userId: req.user.userId,
                deckCard: {
                    create: cards.map(cardId => ({ cardId }))
                }
            },
            include: { deckCard: true } // Toutes les infos des cartes
        })

        return res.status(201).json(deck)
    } catch (error) {
        console.error('Erreur lors de la création du deck :', error)
        return res.status(500).json({ error: 'Erreur serveur.' })
    }
})