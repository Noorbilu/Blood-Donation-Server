// server.js (blood-donation backend)

const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@laa.0ndrbne.mongodb.net/?appName=Laa`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

const db = client.db('bloodDonation_db');
    const DonationCollection = db.collection('donation-requests');
    const usersCollection = db.collection('users');
    const fundingCollection = db.collection('fundings'); // future Funding page

    /* -------------------------------- USERS -------------------------------- */

    // registration শেষে client থেকে POST /users
    app.post('/users', async (req, res) => {
      try {
        const user = req.body; // { name, email, avatar, bloodGroup, district, upazila }

        const exists = await usersCollection.findOne({ email: user.email });
        if (exists) {
          return res.send({ message: 'user exists' });
        }

        user.role = 'donor';      // default role
        user.status = 'active';   // default status
        user.createdAt = new Date();

        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to save user' });
      }
    });

    // All users list (admin panel) + optional status filter (active/blocked)
// All users list (admin panel, search page) + optional filters
app.get('/users', async (req, res) => {
  try {
    const { status, role, bloodGroup, district, upazila } = req.query;
    const query = {};

    if (status) {
      query.status = status; // active | blocked
    }
    if (role) {
      query.role = role; // donor | admin | volunteer
    }
    if (bloodGroup) {
      query.bloodGroup = bloodGroup;
    }
    if (district) {
      query.district = district;
    }
    if (upazila) {
      query.upazila = upazila;
    }

    const users = await usersCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(users);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: 'Failed to get users' });
  }
});

    
    app.get('/users/:email/role', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.send({ role: user?.role || 'donor' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to get user role' });
      }
    });

    // status update (active / blocked) -> admin
    app.patch('/users/:id/status', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // 'active' | 'blocked'

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to update status' });
      }
    });

    // role update (donor / volunteer / admin) -> admin
    app.patch('/users/:id/role', async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body; // 'donor' | 'volunteer' | 'admin'

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to update role' });
      }
    });

    /* --------------------------- DASHBOARD STATS --------------------------- */

    app.get('/dashboard-stats', async (req, res) => {
      try {
        const totalDonors = await usersCollection.countDocuments({
          role: 'donor',
        });

        const fundingAgg = await fundingCollection
          .aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }])
          .toArray();
        const totalFunding = fundingAgg[0]?.total || 0;

        const totalDonationRequests = await DonationCollection.countDocuments();

        res.send({
          totalDonors,
          totalFunding,
          totalDonationRequests,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to get dashboard stats' });
      }
    });

    /* ------------------------ DONATION REQUESTS API ------------------------ */

    // list + filter (donor / admin / volunteer / search)
    app.get('/donation-requests', async (req, res) => {
      try {
        const { email, status, bloodGroup, district, upazila } = req.query;
        const query = {};

        // donor dashboard -> own requests
        if (email) {
          query.requesterEmail = email;
        }

        // admin/volunteer filter by status
        if (status) {
          query.status = status; // pending | inprogress | done | canceled
        }

        // search filters (optional)
        if (bloodGroup) query.bloodGroup = bloodGroup;
        if (district) query.recipientDistrict = district;
        if (upazila) query.recipientUpazila = upazila;

        const options = { sort: { createdAt: -1 } };

        const cursor = DonationCollection.find(query, options);
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to get donation requests' });
      }
    });

    // single donation request
    app.get('/donation-requests/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await DonationCollection.findOne(query);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to get donation request' });
      }
    });

    // update donation request (donor / admin / volunteer)
    app.patch('/donation-requests/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body; // যে field পাঠাবে শুধু সেগুলোই update হবে
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: updatedData,
        };

        const result = await DonationCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to update donation request' });
      }
    });

    // delete donation request (donor own / admin all)
    app.delete('/donation-requests/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await DonationCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to delete donation request' });
      }
    });

    // create donation request
    app.post('/donation-requests', async (req, res) => {
      try {
        const donation = req.body;
        donation.createdAt = new Date();
        donation.status = donation.status || 'pending';
        const result = await DonationCollection.insertOne(donation);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to create donation request' });
      }
    });

    await client.db('admin').command({ ping: 1 });
    console.log('MongoDB connected!');
  } finally {
    // client.close() debounce korar jonno empty rakha
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('redHope is hoping!!');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});