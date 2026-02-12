import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: number
                email: string
            }
        }
    }
}

/**
 * Middleware d'authentification JWT.
 *
 * Vérifie la présence d'un token dans l'en-tête Authorization (Bearer token),
 * le valide à l'aide de la clé secrète JWT et attache les informations
 * utilisateur décodées à la requête.
 *
 * @param {Request} req - Objet requête Express contenant les headers HTTP.
 * @param {Response} res - Objet réponse Express.
 * @param {NextFunction} next - Fonction permettant de passer au middleware suivant.
 *
 * @returns {void} Retourne une réponse HTTP 401 si le token est manquant, invalide ou expiré.
 *
 * @throws {Error} Si la vérification du token échoue.
 */
export const authentificateToken = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    // Récupérer le token depuis l'en-tête Authorization
    const authHeader = req.headers.authorization

    if (!authHeader) {
        return res.status(401).json({ error: 'Token manquant.' })
    }

    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
        return res.status(401).json({ error: 'Token invalide.' })
    }

    try {
        // Vérifier et décoder le token
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
            userId: number
            email: string
        }

        // Ajouter userId à la requête pour l'utiliser dans les routes
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
        }

        // Passer au prochain middleware ou à la route
        return next()
    } catch (error) {
        return res.status(401).json({ error: 'Token invalide ou expiré' })
    }
}