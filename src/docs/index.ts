import YAML from 'yamljs'
import path from 'path'

// Charger la config principale
const swaggerConfig = YAML.load(path.join(__dirname, 'swagger.config.yml'))

// Charger les modules
const authDoc = YAML.load(path.join(__dirname, 'auth.doc.yml'))

const cardDoc = YAML.load(path.join(__dirname, 'card.doc.yml'))

const deckDoc = YAML.load(path.join(__dirname, 'deck.doc.yml'))

export const swaggerDocument = {
    ...swaggerConfig,
    paths: {
        ...authDoc.paths,
        ...cardDoc.paths,
        ...deckDoc.paths,
    },
}
