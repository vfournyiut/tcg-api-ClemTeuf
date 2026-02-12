import { Request, Response, Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from "../src/database";

export const authRouter = Router()

/**
 * @typedef {Object} SignUpBody
 * @property {string} email - Adresse email unique de l'utilisateur.
 * @property {string} username - Nom d'utilisateur affiché.
 * @property {string} password - Mot de passe en clair (sera hashé).
 */

/**
 * @typedef {Object} SignInBody
 * @property {string} email - Adresse email de l'utilisateur.
 * @property {string} password - Mot de passe en clair.
 */

/**
 * @async
 * @route POST /api/auth/sign-up
 *
 * Crée un nouvel utilisateur.
 *
 * Vérifie les données reçues, contrôle l'unicité de l'email,
 * hash le mot de passe, enregistre l'utilisateur en base
 * puis retourne un token JWT valide 7 jours.
 *
 * @param {Request} req - Requête Express contenant les informations utilisateur.
 * @param {SignUpBody} req.body - Données nécessaires à la création du compte.
 * @param {Response} res - Réponse Express.
 *
 * @returns {201} Utilisateur créé avec token JWT.
 * @returns {400} Si des données sont manquantes.
 * @returns {409} Si l'email est déjà utilisé.
 * @returns {500} En cas d'erreur serveur.
 *
 * @throws {Error} Si la création de l'utilisateur ou le hash échoue.
 */
authRouter.post('/api/auth/sign-up', async (req: Request, res: Response) => {
    const { email, username, password } = req.body

    try {
        // Validation
        if (!email || !username || !password) {
            return res.status(400).json({ error: 'Données manquantes.' })
        }

        // Vérification de l'email
        const existingUser = await prisma.user.findUnique({
            where: { email }
        })

        if (existingUser) {
            return res.status(409).json({ error: 'Données non valides.' })
        }

        // Hashage du mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

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
            { expiresIn: '7d' }
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

/**
 * @async
 * @route POST /api/auth/sign-in
 *
 * Authentifie un utilisateur existant.
 *
 * Vérifie l'existence de l'utilisateur, compare le mot de passe
 * hashé en base, puis génère un token JWT valide 7 jours.
 *
 * @param {Request} req - Requête Express contenant les identifiants.
 * @param {SignInBody} req.body - Email et mot de passe.
 * @param {Response} res - Réponse Express.
 *
 * @returns {200} Connexion réussie avec token JWT.
 * @returns {401} Si les identifiants sont invalides.
 * @returns {500} En cas d'erreur serveur.
 *
 * @throws {Error} Si la vérification ou la génération du token échoue.
 */
authRouter.post('/api/auth/sign-in', async (req: Request, res: Response) => {
    const { email, password } = req.body

    try {
        // Vérifier que l'utilisateur existe
        const user = await prisma.user.findUnique({
            where: { email }
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
            { expiresIn: '7d' }
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