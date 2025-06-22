const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const dbName = 'chesshive';

let db;

async function connectDB() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    db = client.db(dbName);
    console.log('Connected to MongoDB');

    // Initialize collections with schemas
    await initializeCollections(db);
    return db;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }
}

async function initializeCollections(db) {
  // Helper function to initialize or update a collection
  async function initializeCollection(collectionName, validator, indexes = []) {
    try {
      const collections = await db.listCollections({ name: collectionName }).toArray();
      if (collections.length === 0) {
        await db.createCollection(collectionName, { validator });
        console.log(`${collectionName} collection created`);
      } else {
        await db.command({
          collMod: collectionName,
          validator
        });
        console.log(`${collectionName} collection validator updated`);
      }
      // Apply indexes if provided
      for (const [field, options] of indexes) {
        await db.collection(collectionName).createIndex(field, options);
      }
    } catch (err) {
      console.error(`Error initializing ${collectionName}:`, err);
      throw err;
    }
  }

  // Users collection
  await initializeCollection('users', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email', 'password', 'role', 'isDeleted'],
      properties: {
        name: { bsonType: 'string' },
        email: { bsonType: 'string' },
        password: { bsonType: 'string' },
        role: { bsonType: 'string', enum: ['admin', 'organizer', 'coordinator', 'player'] },
        isDeleted: { bsonType: 'int' },
        dob: { bsonType: 'date' },
        gender: { bsonType: 'string', enum: ['male', 'female', 'other'] },
        college: { bsonType: 'string' },
        phone: { bsonType: 'string' },
        AICF_ID: { bsonType: 'string' },
        FIDE_ID: { bsonType: 'string' }
      }
    }
  }, [[{ email: 1 }, { unique: true }]]);

  // Contact collection
  await initializeCollection('contact', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email', 'message', 'submission_date'],
      properties: {
        name: { bsonType: 'string' },
        email: { bsonType: 'string' },
        message: { bsonType: 'string' },
        submission_date: { bsonType: 'date' }
      }
    }
  });

  // Tournaments collection
  await initializeCollection('tournaments', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'date', 'location', 'entry_fee', 'status', 'added_by'],
      properties: {
        name: { bsonType: 'string' },
        date: { bsonType: 'date' },
        location: { bsonType: 'string' },
        entry_fee: { bsonType: 'number' },
        status: { bsonType: 'string' },
        added_by: { bsonType: 'string' },
        type: { bsonType: 'string' },
        no_of_rounds: { bsonType: 'int' },
        time: { bsonType: 'string' }
      }
    }
  });

  // User Balances collection
  await initializeCollection('user_balances', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['user_id', 'wallet_balance'],
      properties: {
        user_id: { bsonType: 'objectId' },
        wallet_balance: { bsonType: 'number' }
      }
    }
  });

  // Subscriptionstable collection
  await initializeCollection('subscriptionstable', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['username', 'plan', 'price', 'start_date', 'end_date'],
      properties: {
        username: { bsonType: 'string' },
        plan: { bsonType: 'string' },
        price: { bsonType: 'number' },
        start_date: { bsonType: 'date' },
        end_date: { bsonType: 'date' }
      }
    }
  });

  // Products collection
  await initializeCollection('products', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'price', 'image_url', 'coordinator', 'college', 'availability'],
      properties: {
        name: { bsonType: 'string' },
        price: { bsonType: 'number' },
        image_url: { bsonType: 'string' },
        coordinator: { bsonType: 'string' },
        college: { bsonType: 'string' },
        availability: { bsonType: 'int' }
      }
    }
  });

  // Sales collection
  await initializeCollection('sales', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['product_id', 'price', 'buyer', 'college', 'purchase_date'],
      properties: {
        product_id: { bsonType: 'objectId' },
        price: { bsonType: 'number' },
        buyer: { bsonType: 'string' },
        college: { bsonType: 'string' },
        purchase_date: { bsonType: 'date' }
      }
    }
  });

  // Meetings collection
  await initializeCollection('meetingsdb', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['title', 'date', 'time', 'link', 'role', 'name'],
      properties: {
        title: { bsonType: 'string' },
        date: { bsonType: 'date' },
        time: { bsonType: 'string' },
        link: { bsonType: 'string' },
        role: { bsonType: 'string' },
        name: { bsonType: 'string' }
      }
    }
  });

  // Player Stats collection
  await initializeCollection('player_stats', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['player_id', 'wins', 'losses', 'draws', 'winRate', 'gamesPlayed', 'rating'],
      properties: {
        player_id: { bsonType: 'objectId' },
        wins: { bsonType: 'int' },
        losses: { bsonType: 'int' },
        draws: { bsonType: 'int' },
        winRate: { bsonType: 'number' },
        gamesPlayed: { bsonType: 'number' },
        rating: { bsonType: 'number' }
      }
    }
  });

  // Tournament Players collection
  await initializeCollection('tournament_players', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['tournament_id', 'username', 'college', 'gender'],
      properties: {
        tournament_id: { bsonType: 'objectId' },
        username: { bsonType: 'string' },
        college: { bsonType: 'string' },
        gender: { bsonType: 'string' }
      }
    }
  });

  // Enrolled Tournaments Team collection
  await initializeCollection('enrolledtournaments_team', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['tournament_id', 'captain_id', 'player1_name', 'player2_name', 'player3_name', 'enrollment_date', 'player1_approved', 'player2_approved', 'player3_approved', 'approved'],
      properties: {
        tournament_id: { bsonType: 'objectId' },
        captain_id: { bsonType: 'objectId' },
        player1_name: { bsonType: 'string' },
        player2_name: { bsonType: 'string' },
        player3_name: { bsonType: 'string' },
        enrollment_date: { bsonType: 'date' },
        player1_approved: { bsonType: 'int' },
        player2_approved: { bsonType: 'int' },
        player3_approved: { bsonType: 'int' },
        approved: { bsonType: 'int' }
      }
    }
  });

  // Tournament Pairings collection
  await initializeCollection('tournament_pairings', {
    $jsonSchema: {
      bsonType: 'object',
      required: ['tournament_id', 'totalRounds', 'rounds'],
      properties: {
        tournament_id: { bsonType: 'objectId' },
        totalRounds: { bsonType: 'int' },
        rounds: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['round', 'pairings'],
            properties: {
              round: { bsonType: 'int' },
              pairings: {
                bsonType: 'array',
                items: {
                  bsonType: 'object',
                  required: ['player1', 'player2', 'result'],
                  properties: {
                    player1: {
                      bsonType: 'object',
                      required: ['id', 'username', 'score'],
                      properties: {
                        id: { bsonType: 'objectId' },
                        username: { bsonType: 'string' },
                        score: { bsonType: 'number' }
                      }
                    },
                    player2: {
                      bsonType: 'object',
                      required: ['id', 'username', 'score'],
                      properties: {
                        id: { bsonType: 'objectId' },
                        username: { bsonType: 'string' },
                        score: { bsonType: 'number' }
                      }
                    },
                    result: { bsonType: 'string' }
                  }
                }
              },
              byePlayer: {
                bsonType: ['object', 'null'],
                properties: {
                  id: { bsonType: 'objectId' },
                  username: { bsonType: 'string' },
                  score: { bsonType: 'number' }
                }
              }
            }
          }
        }
      }
    }
  });

  console.log('All collections initialized with schemas');
}

module.exports = { connectDB };