const express = require('express')
const cors = require('cors')
var jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const nodemailer = require("nodemailer");
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SCRET_KEY);

const app = express()
const port = process.env.PORT || 8080

// middlewares
app.use(cors())
app.use(express.json())




// Nodemail
const sendMail = (bookingData, email) => {
  console.log(bookingData, email)

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.NODEMAILER,
      pass: process.env.PASS
    }
  });

  const mailOptions = {
    from: process.env.NODEMAILER,
    to: email,
    subject: bookingData?.subject,
    html: `<p>${bookingData?.messages}</p>
    <p>Price: ${bookingData?.price}</p>
    <p>TransactionId: ${bookingData?.transactionId}</p>
    <p>Location: ${bookingData?.home?.location}</p>
    <p>From: ${bookingData?.home?.from}</p>
    <p>To: ${bookingData?.home?.to}</p>
    <p style={margin-bottom: 10px}>Host Email: ${bookingData?.hostEmail}</p>
    <img src=${bookingData?.home?.image}/>


    `
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
      // do something useful
    }
  });


}

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send('Unauthorized access')
  }
  const token = authHeader.split(' ')[1]

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden Access' })
    }
    req.decoded = decoded;

    next()
  })

}


// Database Connection
const uri = process.env.RB_URI
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
})

async function run() {
  try {
    const homesCollection = client.db('roombooking').collection('homes');
    const userCollections = client.db('roombooking').collection('users');
    const bookingCollections = client.db('roombooking').collection('bookings');
    const paymentCollections = client.db('roombooking').collection('payments');


    //  Save user email and generate JWT
    app.put('/user/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user
      }
      const result = await userCollections.updateOne(filter, updateDoc, options);

      // JWT 
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1d'
      })

      res.send({ result, token })
    })


    //  get user Role
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      const user = await userCollections.findOne(query)
      res.send(user)
    })

    //  get all user Role
    app.get('/users', async (req, res) => {
      const users = await userCollections.find().toArray()
      res.send(users)
    })

    // Services Post 
    app.post('/services', async (req, res) => {
      const service = req.body;
      const result = await homesCollection.insertOne(service)
      res.send(result)
    })

    // Services Post 
    app.get('/services', async (req, res) => {
      const query = {}
      const email = req.params.email;
      if (email) {
        query = {
          host: {
            email: email
          }
        }
      }
      const result = await homesCollection.find(query).toArray()
      res.send(result)
    })



    // Update service
    app.put('/service', async (req, res) => {
      const service = req.body;
      console.log(service)
      const filter = {}
      const options = { upsert: true };

      const updateDoc = {
        $set: service
      }

      const result = await homesCollection.updateOne(filter, updateDoc, options);
      res.send(result)

    })

    // Single Service
    app.get('/service/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) }
      const result = await homesCollection.findOne(query);
      res.send(result)

    })

    // Services Post 
    app.delete('/services/:id',  async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) }
      const result = await homesCollection.deleteOne(filter)
      console.log(result)
      res.send(result)
    })

    // Serach Result
    app.get('/serach-result', async (req, res) => {
      const query = {}
      const location = req.query.location;
      if (location) {
        query.location = location
      } else {
        res.send({ message: `No result found` })
      };


      const cursor = homesCollection.find(query)
      const result = await cursor.toArray()
      res.send(result)

    })

    // Booking data post method in database
    app.post('/bookings', async (req, res) => {
      const bookingData = req.body;
      const result = await bookingCollections.insertOne(bookingData);
      sendMail(
        {
          subject: `Booking successful`,
          messages: `Booking id: ${result.insertedId}`,
          ...bookingData
        },
        bookingData?.guestEmail)

      res.send({ transactionId: bookingData.transactionId })
      console.log(result)
    })

    // Get Booking data from Database
    app.get('/bookings', async (req, res) => {
      let query = {};
      const email = req.query.email;
      if (email) {
        query = {
          guestEmail: email
        }
      }
      const result = await bookingCollections.find(query).toArray()
      res.send(result)
    })



    // Payment 
    app.post('/create-payment', async (req, res) => {
      const price = req.body.price;
      const amount = parseFloat(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: [
          "card"
        ],
      })

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })



  } finally {
  }
}

run().catch(err => console.error(err))

app.get('/', (req, res) => {
  res.send('Server is running...')
})

app.listen(port, () => {
  console.log(`Server is running...on ${port}`)
})
