import { Request, Response, Router } from 'express'
import { prisma } from '../src/database'
import { authentificateToken } from './auth.middleware'

export const decksCreateRouter = Router()

decksCreateRouter.post(
  '/api/decks',
  authentificateToken,
  async (req: Request, res: Response) => {
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
        return res
          .status(400)
          .json({ error: 'Un deck doit contenir 10 cartes.' })
      }

      // Vérifier l'existence des cartes
      const existingCards = await prisma.card.findMany({
        where: { id: { in: cards } },
      })

      if (existingCards.length !== 10) {
        return res
          .status(400)
          .json({ error: 'Certaines cartes sont invalides ou inexistantes.' })
      }

      // Créer le deck
      const deck = await prisma.deck.create({
        data: {
          name,
          userId: req.user.userId,
          deckCard: {
            create: cards.map((cardId) => ({ cardId })),
          },
        },
        include: { deckCard: true }, // Toutes les infos des cartes
      })

      return res.status(201).json(deck)
    } catch (error) {
      console.error('Erreur lors de la création du deck :', error)
      return res.status(500).json({ error: 'Erreur serveur.' })
    }
  },
)
