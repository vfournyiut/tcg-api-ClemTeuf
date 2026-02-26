import { Router } from 'express'

import { decksCreateRouter } from './decks.create.route'
import { decksDeleteRouter } from './decks.delete.route'
import { decksGetRouter } from './decks.get.route'
import { decksMineRouter } from './decks.mine.route'
import { decksPatchRouter } from './decks.patch.route'

export const decksRouter = Router()

decksRouter.use(decksCreateRouter)
decksRouter.use(decksMineRouter)
decksRouter.use(decksGetRouter)
decksRouter.use(decksPatchRouter)
decksRouter.use(decksDeleteRouter)