import { Request, Response, Router } from 'express'

import { prisma } from '../src/database'

export const cardsRouter = Router()

cardsRouter.get('/api/cards', async (_req: Request, res: Response) => {
  try {
    const cards = await prisma.card.findMany({
      orderBy: {
        pokedexNumber: 'asc',
      },
    })

    return res.status(200).json(cards)
  } catch (error) {
    console.error('Erreur lors de la récupération des cartes :', error)
    return res.status(500).json({ error: 'Erreur serveur' })
  }
})
