import bcrypt from 'bcryptjs'
import { readFileSync } from 'fs'
import { join } from 'path'

import { prisma } from '../src/database'
import { PokemonType } from '../src/generated/prisma/enums'
import { CardModel } from '../src/generated/prisma/models/Card'

function getRandomCards(cards: unknown[], count: number): unknown[] {
  const shuffled = [...cards].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

async function main() {
  console.log('🌱 Starting database seed...')

  await prisma.deckCard.deleteMany()
  await prisma.deck.deleteMany()
  await prisma.card.deleteMany()
  await prisma.user.deleteMany()

  const hashedPassword = await bcrypt.hash('password123', 10)

  await prisma.user.createMany({
    data: [
      {
        username: 'red',
        email: 'red@example.com',
        password: hashedPassword,
      },
      {
        username: 'blue',
        email: 'blue@example.com',
        password: hashedPassword,
      },
    ],
  })

  const redUser = await prisma.user.findUnique({
    where: { email: 'red@example.com' },
  })
  const blueUser = await prisma.user.findUnique({
    where: { email: 'blue@example.com' },
  })

  if (!redUser || !blueUser) {
    throw new Error('Failed to create users')
  }

  console.log('✅ Created users:', redUser.username, blueUser.username)

  const pokemonDataPath = join(__dirname, 'data', 'pokemon.json')
  const pokemonJson = readFileSync(pokemonDataPath, 'utf-8')
  const pokemonData: CardModel[] = JSON.parse(pokemonJson)

  const createdCards = await Promise.all(
    pokemonData.map((pokemon) =>
      prisma.card.create({
        data: {
          name: pokemon.name,
          hp: pokemon.hp,
          attack: pokemon.attack,
          type: PokemonType[pokemon.type as keyof typeof PokemonType],
          pokedexNumber: pokemon.pokedexNumber,
          imgUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.pokedexNumber}.png`,
        },
      }),
    ),
  )

  console.log(`✅ Created ${pokemonData.length} Pokemon cards`)

  async function createStarterDeck(userId: number) {
    const deck = await prisma.deck.create({
      data: { name: 'Starter Deck', userId },
    })

    const randomCards = getRandomCards(createdCards, 10)

    await prisma.deckCard.createMany({
      data: randomCards.map((card) => ({
        deckId: deck.id,
        cardId: card.id,
      })),
    })

    return deck
  }

  const redDeck = await createStarterDeck(redUser.id)
  const blueDeck = await createStarterDeck(blueUser.id)

  console.log(
    '✅ Starter decks created for users:',
    redDeck.name,
    blueDeck.name,
  )

  console.log('\n🎉 Database seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
