import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/index'
import { prismaMock } from './vitest.setup'

describe('Cards API – consultation', () => {
  beforeEach(() => {
    prismaMock.card.findMany.mockReset()
  })

  it('GET /api/cards - should return cards ordered by pokedexNumber', async () => {
    prismaMock.card.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Bulbasaur',
        hp: 45,
        attack: 49,
        type: 'Grass',
        pokedexNumber: 1,
        imgUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 4,
        name: 'Charmander',
        hp: 39,
        attack: 52,
        type: 'Fire',
        pokedexNumber: 4,
        imgUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const res = await request(app).get('/api/cards')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].pokedexNumber).toBe(1)
  })

  it('GET /api/cards - should return empty array if no cards', async () => {
    prismaMock.card.findMany.mockResolvedValue([])

    const res = await request(app).get('/api/cards')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('GET /api/cards - should return 500 on prisma error', async () => {
    prismaMock.card.findMany.mockRejectedValue(new Error('DB error'))

    const res = await request(app).get('/api/cards')

    expect(res.status).toBe(500)
    expect(res.body).toHaveProperty('error')
  })
})
