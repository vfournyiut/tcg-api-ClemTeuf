import {NextFunction, Request, Response} from 'express'
import jwt from 'jsonwebtoken'

declare global {
    namespace Express {
        interface Request {
            user? : {
                userId : number
                email : string
            }
        }
    }
}

export const authentificateToken = (
    req : Request,
    res : Response,
    next : NextFunction,
) => {
    // Récupérer le token depuis l'en-tête Authorization
    const authHeader = req.headers.authorization

    if(!authHeader) {
        return res.status(401).json({error : 'Token manquant.'})
    }

    const [type, token] = authHeader.split(' ')

    if(type !== 'Bearer' || !token) {
        return res.status(401).json({error : 'Token invalide.'})
    }

    try {
        // Vérifier et décoder le token
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
            userId: number
            email: string
        }

        // Ajouter userId à la requête pour l'utiliser dans les routes
        req.user = {
            userId : decoded.userId,
            email : decoded.email,
        }

        // Passer au prochain middleware ou à la route
        next()
    } catch (error) {
        return res.status(401).json({error : 'Token invalide ou expiré'})
    }
}