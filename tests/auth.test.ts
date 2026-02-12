import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/index'
import { prismaMock } from './vitest.setup'
import bcrypt from 'bcryptjs'

process.env.JWT_SECRET = 'test-secret'

const createMockUser = (id: number, email: string, username: string, password: string) => ({
  id,
  email,
  username,
  password,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const validUserPayload = {
  email: 'test@test.com',
  username: 'testuser',
  password: 'password123',
}

describe('Auth endpoints', () => {

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/auth/sign-up', () => {

    it('should create a user and return a token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)
      prismaMock.user.create.mockResolvedValue(
        createMockUser(1, validUserPayload.email, validUserPayload.username, 'hashedpassword')
      )

      const response = await request(app)
        .post('/api/auth/sign-up')
        .send(validUserPayload)

      expect(response.status).toBe(201)
      expect(response.body).toHaveProperty('token')
      expect(response.body.user).toMatchObject({
        id: 1,
        name: validUserPayload.username,
        email: validUserPayload.email,
      })
    })

    describe('Validation errors', () => {
      it('should return 400 if data is missing', async () => {
        const response = await request(app)
          .post('/api/auth/sign-up')
          .send({ email: 'test@test.com' })

        expect(response.status).toBe(400)
        expect(response.body).toHaveProperty('error')
      })

      it('should return 409 if email already exists', async () => {
        prismaMock.user.findUnique.mockResolvedValue(
          createMockUser(1, validUserPayload.email, 'existing', 'hashed')
        )

        const response = await request(app)
          .post('/api/auth/sign-up')
          .send(validUserPayload)

        expect(response.status).toBe(409)
      })
    })

    it('should return 500 on prisma error', async () => {
      prismaMock.user.findUnique.mockRejectedValue(new Error('DB error'))

      const response = await request(app)
        .post('/api/auth/sign-up')
        .send(validUserPayload)

      expect(response.status).toBe(500)
    })
  })

  describe('POST /api/auth/sign-in', () => {

    it('should login successfully and return a token', async () => {
      const hashedPassword = await bcrypt.hash(validUserPayload.password, 10)
      prismaMock.user.findUnique.mockResolvedValue(
        createMockUser(1, validUserPayload.email, validUserPayload.username, hashedPassword)
      )

      const response = await request(app)
        .post('/api/auth/sign-in')
        .send({
          email: validUserPayload.email,
          password: validUserPayload.password,
        })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('token')
      expect(response.body.user.email).toBe(validUserPayload.email)
    })

    describe('Authentication errors', () => {
      it('should return 401 if user does not exist', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null)

        const response = await request(app)
          .post('/api/auth/sign-in')
          .send({
            email: 'unknown@test.com',
            password: validUserPayload.password,
          })

        expect(response.status).toBe(401)
      })

      it('should return 401 if password is invalid', async () => {
        const wrongHashedPassword = await bcrypt.hash('wrongpassword', 10)
        prismaMock.user.findUnique.mockResolvedValue(
          createMockUser(1, validUserPayload.email, validUserPayload.username, wrongHashedPassword)
        )

        const response = await request(app)
          .post('/api/auth/sign-in')
          .send({
            email: validUserPayload.email,
            password: validUserPayload.password,
          })

        expect(response.status).toBe(401)
      })
    })

    it('should return 500 on prisma error', async () => {
      prismaMock.user.findUnique.mockRejectedValue(new Error('DB error'))

      const response = await request(app)
        .post('/api/auth/sign-in')
        .send({
          email: validUserPayload.email,
          password: validUserPayload.password,
        })

      expect(response.status).toBe(500)
    })
  })
})
