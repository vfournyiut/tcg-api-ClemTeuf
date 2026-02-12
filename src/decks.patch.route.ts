import { Request, Response, Router } from 'express'
import { prisma } from '../src/database'
import { authentificateToken } from './auth.middleware'

export const decksPatchRouter = Router()

decksPatchRouter.patch(
  '/api/decks/:id',
  authentificateToken,
  async (req: Request, res: Response) => {
    try {
      // Vérifications
      if (!req.user) {
        return res.status(401).json({ error: 'Token manquant ou invalide.' })
      }

      const deckId = Number(req.params.id)

      if (isNaN(deckId)) {
        return res.status(400).json({ error: 'ID de deck invalide.' })
      }

      const { name, cards } = req.body

      // Récupérer le deck
      const deck = await prisma.deck.findUnique({
        where: { id: deckId },
        include: { deckCard: true },
      })

      if (!deck) {
        return res.status(404).json({ error: 'Deck introuvable.' })
      }

      if (deck.userId !== req.user.userId) {
        return res.status(403).json({ error: 'Accès refusé à ce deck.' })
      }

      // Vérification de la présence des cartes
      if (cards) {
        if (!Array.isArray(cards) || cards.length !== 10) {
          return res
            .status(400)
            .json({ error: 'Un deck doit contenir 10 cartes.' })
        }

        const existingCards = await prisma.card.findMany({
          where: { id: { in: cards } },
        })

        if (existingCards.length !== 10) {
          return res
            .status(400)
            .json({ error: 'Certaines cartes sont invalides ou inexistantes.' })
        }

        // Supprimer les anciennes cartes et créer les nouvelles
        await prisma.deckCard.deleteMany({
          where: { deckId },
        })
        await prisma.deckCard.createMany({
          data: cards.map((cardId) => ({ deckId, cardId })),
        })
      }

      // Mettre à jour le nom du deck
      const updatedDeck = await prisma.deck.update({
        where: { id: deckId },
        data: {
          name: name ?? deck.name,
        },
        include: {
          deckCard: {
            include: { card: true },
          },
        },
      })

      return res.status(200).json(updatedDeck)
    } catch (error) {
      console.error('Erreur lors de la modification du deck :', error)
      return res.status(500).json({ error: 'Erreur serveur.' })
    }
  },
)
