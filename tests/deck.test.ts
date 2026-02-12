import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index'
import { prismaMock } from './vitest.setup'
import { PokemonType } from '../src/generated/prisma/client'

let shouldAddUser = true

vi.mock('../src/auth.middleware', () => ({
  authentificateToken: (req: any, _res: any, next: any) => {
    if (shouldAddUser) {
      req.user = { userId: 1 }
    }
    next()
  },
}))

const createMockCard = (id: number) => ({
  id,
  name: 'Card',
  hp: 10,
  attack: 10,
  type: 'Fire' as PokemonType,
  pokedexNumber: id,
  imgUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const createMockDeck = (
  id: number,
  userId: number,
  name: string = 'Deck 1',
) => ({
  id,
  name,
  userId,
  createdAt: new Date(),
  updatedAt: new Date(),
  deckCard: [],
})

const mockCardsArray = (count: number) =>
  Array.from({ length: count }, (_, i) => createMockCard(i + 1))

describe('Decks API – CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shouldAddUser = true
  })

  describe('Authentication', () => {
    beforeEach(() => {
      shouldAddUser = false
    })

    const authTestCases = [
      {
        method: 'post',
        endpoint: '/api/decks',
        body: { name: 'My Deck', cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      },
      { method: 'get', endpoint: '/api/decks/mine' },
      { method: 'get', endpoint: '/api/decks/1' },
      { method: 'patch', endpoint: '/api/decks/1', body: { name: 'New Name' } },
      { method: 'delete', endpoint: '/api/decks/1' },
    ]

    authTestCases.forEach(({ method, endpoint, body }) => {
      it(`${method.toUpperCase()} ${endpoint} - should reject without valid token`, async () => {
        let req: request.Test
        switch (method) {
          case 'post':
            req = request(app).post(endpoint)
            break
          case 'get':
            req = request(app).get(endpoint)
            break
          case 'patch':
            req = request(app).patch(endpoint)
            break
          case 'delete':
            req = request(app).delete(endpoint)
            break
          default:
            throw new Error(`Unknown method: ${method}`)
        }
        const res = body ? await req.send(body) : await req

        expect(res.status).toBe(401)
        expect(res.body.error).toContain('Token')
      })
    })
  })

  /* CRÉER */

  describe('POST /api/decks', () => {
    it('should create deck with 10 valid cards', async () => {
      prismaMock.card.findMany.mockResolvedValue(mockCardsArray(10))
      prismaMock.deck.create.mockResolvedValue(
        createMockDeck(1, 1, 'My Deck') as any,
      )

      const res = await request(app)
        .post('/api/decks')
        .send({
          name: 'My Deck',
          cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('My Deck')
    })

    describe('Validation errors', () => {
      const validationTests = [
        {
          name: 'should reject if no name',
          payload: { cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
          expectedError: 'Nom du deck obligatoire',
        },
        {
          name: 'should reject if not 10 cards',
          payload: { name: 'Invalid Deck', cards: [1, 2, 3] },
          expectedError: '10 cartes',
        },
        {
          name: 'should reject if cards not array',
          payload: { name: 'Invalid Deck', cards: 'not an array' },
          expectedError: '10 cartes',
        },
      ]

      validationTests.forEach(({ name, payload, expectedError }) => {
        it(name, async () => {
          const res = await request(app).post('/api/decks').send(payload)

          expect(res.status).toBe(400)
          expect(res.body.error).toContain(expectedError)
        })
      })
    })

    it('should reject if some cards do not exist', async () => {
      prismaMock.card.findMany.mockResolvedValue(mockCardsArray(5))

      const res = await request(app)
        .post('/api/decks')
        .send({
          name: 'Invalid Deck',
          cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('invalides ou inexistantes')
    })

    it('should return 500 on database error', async () => {
      prismaMock.card.findMany.mockRejectedValue(new Error('DB error'))

      const res = await request(app)
        .post('/api/decks')
        .send({
          name: 'My Deck',
          cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        })

      expect(res.status).toBe(500)
      expect(res.body.error).toContain('Erreur serveur')
    })
  })

  /* MINE */

  describe('GET /api/decks/mine', () => {
    it('should return user decks', async () => {
      prismaMock.deck.findMany.mockResolvedValue([createMockDeck(1, 1)] as any)

      const res = await request(app).get('/api/decks/mine')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
    })

    it('should return 500 on database error', async () => {
      prismaMock.deck.findMany.mockRejectedValue(new Error('DB error'))

      const res = await request(app).get('/api/decks/mine')

      expect(res.status).toBe(500)
      expect(res.body.error).toContain('Erreur serveur')
    })
  })

  /* GET DECK */

  describe('GET /api/decks/:id', () => {
    it('should return one deck', async () => {
      prismaMock.deck.findUnique.mockResolvedValue(createMockDeck(1, 1) as any)

      const res = await request(app).get('/api/decks/1')

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(1)
    })

    it('should reject invalid ID', async () => {
      const res = await request(app).get('/api/decks/invalid')

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('ID de deck invalide')
    })

    it('should return 404 if deck not found', async () => {
      prismaMock.deck.findUnique.mockResolvedValue(null)

      const res = await request(app).get('/api/decks/999')

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('introuvable')
    })

    it('should forbid access to other user deck', async () => {
      prismaMock.deck.findUnique.mockResolvedValue(
        createMockDeck(1, 999) as any,
      )

      const res = await request(app).get('/api/decks/1')

      expect(res.status).toBe(403)
      expect(res.body.error).toContain('Accès refusé')
    })

    it('should return 500 on database error', async () => {
      prismaMock.deck.findUnique.mockRejectedValue(new Error('DB error'))

      const res = await request(app).get('/api/decks/1')

      expect(res.status).toBe(500)
      expect(res.body.error).toContain('Erreur serveur')
    })
  })

  /* MODIFIER DECK */

  describe('PATCH /api/decks/:id', () => {
    beforeEach(() => {
      prismaMock.deck.findUnique.mockResolvedValue(
        createMockDeck(1, 1, 'Old Name') as any,
      )
    })

    it('should update deck name only', async () => {
      prismaMock.deck.update.mockResolvedValue(
        createMockDeck(1, 1, 'New Name') as any,
      )

      const res = await request(app)
        .patch('/api/decks/1')
        .send({ name: 'New Name' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('New Name')
    })

    it('should update cards only without name', async () => {
      prismaMock.card.findMany.mockResolvedValue(mockCardsArray(10))
      prismaMock.deckCard.deleteMany.mockResolvedValue({ count: 10 } as any)
      prismaMock.deckCard.createMany.mockResolvedValue({ count: 10 } as any)
      prismaMock.deck.update.mockResolvedValue(
        createMockDeck(1, 1, 'Old Name') as any,
      )

      const res = await request(app)
        .patch('/api/decks/1')
        .send({ cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Old Name')
    })

    it('should update both name and cards', async () => {
      prismaMock.card.findMany.mockResolvedValue(mockCardsArray(10))
      prismaMock.deckCard.deleteMany.mockResolvedValue({ count: 10 } as any)
      prismaMock.deckCard.createMany.mockResolvedValue({ count: 10 } as any)
      prismaMock.deck.update.mockResolvedValue(
        createMockDeck(1, 1, 'New Name') as any,
      )

      const res = await request(app)
        .patch('/api/decks/1')
        .send({
          name: 'New Name',
          cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('New Name')
    })

    describe('Validation and authorization errors', () => {
      it('should reject invalid ID', async () => {
        const res = await request(app)
          .patch('/api/decks/invalid')
          .send({ name: 'New Name' })

        expect(res.status).toBe(400)
        expect(res.body.error).toContain('ID de deck invalide')
      })

      it('should return 404 if deck not found', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(null)

        const res = await request(app)
          .patch('/api/decks/999')
          .send({ name: 'New Name' })

        expect(res.status).toBe(404)
        expect(res.body.error).toContain('introuvable')
      })

      it('should forbid other user', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(
          createMockDeck(1, 999) as any,
        )

        const res = await request(app)
          .patch('/api/decks/1')
          .send({ name: 'New Name' })

        expect(res.status).toBe(403)
        expect(res.body.error).toContain('Accès refusé')
      })

      it('should reject if not 10 cards', async () => {
        const res = await request(app)
          .patch('/api/decks/1')
          .send({ cards: [1, 2, 3] })

        expect(res.status).toBe(400)
        expect(res.body.error).toContain('10 cartes')
      })

      it('should reject if some cards do not exist', async () => {
        prismaMock.card.findMany.mockResolvedValue(mockCardsArray(5))

        const res = await request(app)
          .patch('/api/decks/1')
          .send({ cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })

        expect(res.status).toBe(400)
        expect(res.body.error).toContain('invalides ou inexistantes')
      })

      it('should return 500 on database error', async () => {
        prismaMock.deck.findUnique.mockRejectedValue(new Error('DB error'))

        const res = await request(app)
          .patch('/api/decks/1')
          .send({ name: 'New Name' })

        expect(res.status).toBe(500)
        expect(res.body.error).toContain('Erreur serveur')
      })
    })
  })

  /* SUPPRIMER DECK */

  describe('DELETE /api/decks/:id', () => {
    it('should delete deck', async () => {
      prismaMock.deck.findUnique.mockResolvedValue(createMockDeck(1, 1) as any)
      prismaMock.deckCard.deleteMany.mockResolvedValue({ count: 10 } as any)
      prismaMock.deck.delete.mockResolvedValue({} as any)

      const res = await request(app).delete('/api/decks/1')

      expect(res.status).toBe(200)
      expect(res.body.message).toContain('supprimé')
    })

    it('should reject invalid ID', async () => {
      const res = await request(app).delete('/api/decks/invalid')

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('ID de deck invalide')
    })

    it('should return 404 if deck not found', async () => {
      prismaMock.deck.findUnique.mockResolvedValue(null)

      const res = await request(app).delete('/api/decks/999')

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('introuvable')
    })

    it('should forbid other user', async () => {
      prismaMock.deck.findUnique.mockResolvedValue(
        createMockDeck(1, 999) as any,
      )

      const res = await request(app).delete('/api/decks/1')

      expect(res.status).toBe(403)
      expect(res.body.error).toContain('Accès refusé')
    })

    it('should return 500 on database error', async () => {
      prismaMock.deck.findUnique.mockRejectedValue(new Error('DB error'))

      const res = await request(app).delete('/api/decks/1')

      expect(res.status).toBe(500)
      expect(res.body.error).toContain('Erreur serveur')
    })
  })
})
