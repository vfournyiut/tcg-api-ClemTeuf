import { describe, it, expect, vi } from 'vitest'
import { authentificateToken } from '../src/auth.middleware'
import jwt from 'jsonwebtoken'

describe('authentificateToken middleware', () => {
  const next = vi.fn()

  it('should return 401 if no Authorization header', () => {
    const req: any = { headers: {} }
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    authentificateToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token manquant.' })
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 if Authorization header has no token after Bearer', () => {
    const req: any = { headers: { authorization: 'Bearer ' } }
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    authentificateToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token invalide.' })
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 if token is invalid', () => {
    const req: any = { headers: { authorization: 'Bearer invalidtoken' } }
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    vi.spyOn(jwt, 'verify').mockImplementation(() => {
      throw new Error('invalid')
    })

    authentificateToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token invalide ou expiré' })
    expect(next).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('should attach user to request if token is valid', () => {
    const req: any = { headers: { authorization: 'Bearer validtoken' } }
    const res: any = {}
    const userData = { userId: 1, email: 'test@test.com' }

    vi.spyOn(jwt, 'verify').mockReturnValue(userData as any)

    authentificateToken(req, res, next)

    expect(req.user).toEqual(userData)
    expect(next).toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})
