import bcrypt from 'bcryptjs'
import { Request, Response, Router } from 'express'
import jwt from 'jsonwebtoken'

import { prisma } from '../src/database'

export const authRouter = Router()

authRouter.post('/api/auth/sign-up', async (req: Request, res: Response) => {
  const { email, username, password } = req.body

  try {
    // Validation
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Données manquantes.' })
    }

    // Vérification de l'email
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return res.status(409).json({ error: 'Données non valides.' })
    }

    // Hashage du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10)

    // Création de l'utilisateur
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
      },
    })

    // Générer token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' },
    )

    // Retourner token
    return res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.username,
        email: user.email,
      },
    })
  } catch (error) {
    console.error('Erreur lors de la connexion :', error)
    return res.status(500).json({ error: 'Erreur serveur' })
  }
})

authRouter.post('/api/auth/sign-in', async (req: Request, res: Response) => {
  const { email, password } = req.body

  try {
    // Vérifier que l'utilisateur existe
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return res.status(401).json({ error: 'Données non valides.' })
    }

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Données non valides.' })
    }

    // Générer token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' },
    )

    // Retourner token
    return res.status(200).json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user.id,
        name: user.username,
        email: user.email,
      },
    })
  } catch (error) {
    console.error('Erreur lors de la connexion :', error)
    return res.status(500).json({ error: 'Erreur serveur' })
  }
})
