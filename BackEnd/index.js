const express = require ('express'); // Enables use of express.js
const mongoose = require ('mongoose'); // Enables use of MongoDB database
const cors = require('cors'); // This is used when you are deploying your front end and backend on different servers - Cross Origin Resource Sharing
const path = require("path"); // Enables the backend (server) to connect to the front end (HTML Pages) and display them
const bcrypt = require('bcrypt'); // Enables hashing of passwords
const session = require('express-session');  // enables users to login and logout using a session
const MongoStore = require('connect-mongo');
require('dotenv').config(); // Enables use of .env file
const port = 3000; // Port number the app is running on: http://localhost:3000

const app = express(); // allows you to use express framework for request/functions etc.





app.use(express.json()); // midddleware - translates incoming JSON formats to easy-to-read Javascript objects example: from JSON { "example": "This is an example" } → to Javascript Object { example: "This is an example"}
app.use(cors("*"));





// For user login sessions ↓    
app.use(session({
    secret: process.env.MY_SECRET_KEY,                  // This is a secret string used by express-session to sign the session ID cookie.
    resave: false,                               // This option determines whether to save the session to the store (e.g., a database or memory store) even if the session was not modified.
    saveUninitialized: false,          // This option controls whether to save a session that has not been initialized (i.e., a session with no data in it).
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_DB_URI,
        ttl: 14 * 24 * 60 * 60
    }),                          
    cookie: {
        secure: process.env.COOKIE_SECURE_TYPE === 'production', // This option configures the session cookie. The secure flag ensures the cookie is only sent over HTTPS connections. (true for HTTPS or false for HTTP)
        maxAge: 24 * 60 * 60 * 1000 // 1-day session
    }  
}));


app.set('view engine', 'ejs');        // This tells Express to use EJS as the templating engine
app.set('views', path.join(__dirname, '../FrontEnd/views'));


function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
};




// Connecting to MongoDB database ↓
mongoose.connect(process.env.MONGO_DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("MongoDB Connected")) // Logging the connection
.catch(err => console.error("MongoDB Connection Error:", err)); // Logging the error if unable to connect







// ---------------------- ↓ SCHEMAS ↓ ---------------------- 

// 'Task' Schema with reference to user id

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true},
    description: {type: String, required: true},
    dueDate: { type: Date, required: true},
    completed: {type: Boolean, required: true},
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});
const Task = mongoose.model("Task", taskSchema);



// 'User' Schema

// Defining a model in MongoDB to use when creating/storing users in the database    
const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model("User", userSchema);








// ---------------------- ↓ PAGE SERVING/DISPLAY ↓ ---------------------- 

// Backend serving front end pages ↓
app.use(express.static(path.join(__dirname, '../FrontEnd')));

app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, '../FrontEnd/index.html'));  
});

// Checks authentication before rendering an EJS /dashboard page
app.get('/dashboard', isAuthenticated, (req, res) => {                   

    const userName = req.session.userName;
    res.render('dashboard', { userName });
});

app.get('/pricing', (req, res) => {
    res.sendFile(path.join(__dirname, '../FrontEnd/pricing.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../FrontEnd/login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '../FrontEnd/signup.html'));
});







// ---------------------- ↓ ROUTES ↓ ---------------------- 

//--------------------- TASK HANDLING ↓ ---------------------

// To create new tasks and save them to the database - (with users)
app.post('/tasks', async (req, res) => {
    try {
        const { title, description, dueDate, completed } = req.body; // Extract data from front end request

        if (!title || !description || !dueDate) {
            return res.status(400).json({ Error: "All fields are required!" });
        }

        const userId = req.session.userId;                                      

        if (!userId) {                                                                                 
            return res.status(400).json({ Error: 'User not logged in'});
        }

        const taskData = { title, description, dueDate, completed, user: userId };                  
        const createTask = new Task(taskData); // Create new task model with extracted data
        const saveTask = await createTask.save(); // Save newly created task to the database

        res.status(200).json({ message: 'Save successful', task: saveTask });

    } catch (error) {
        console.error('Error: ', error);
        res.status(500).json();
    }
});




    
// To retrieve tasks from the database and display them on the front end - (with users)
app.get('/tasks', async (req, res) => {
    try {

        const userId = req.session.userId;

        const response = await Task.find({ user: userId }).populate('user');

        console.log(response);
        res.json(response);

    } catch (error) {
        console.error('Backend error:', error);
        res.status(500).json({ error: 'Error grabbing tasks' });
    }
});





// To 'complete' the task and move columns ↓    
app.patch('/tasks/complete/:id', async (req, res) => {
    try {
        const { completed } = req.body;
        const taskId = req.params.id;

        const response = await Task.findByIdAndUpdate(taskId, { completed }, { new: true });

        if (!response) {
            return res.status(404).json({ message: "Task not found" });
        }

        console.log(response);
        res.json(response);
        
    } catch (error) {
        console.error('Error: ', error);
        res.status(500).json({ message: "Internal server error" })
    }
});





// To make the task 'not complete' and move columns ↓    
app.patch('/tasks/notComplete/:id', async (req, res) => {
    try {
        
        const { completed } = req.body;
        const taskId = req.params.id;

        const response = await Task.findByIdAndUpdate(taskId, { completed }, { new: false });

        if (!response) {
            return res.status(404).json({ message: "Task not found" });
        }

        console.log(response);
        res.json({ task: response, message: 'Task set to "Not complete"' });
        
    } catch (error) {
        console.error('Error: ', error);
        res.status(500).json({ message: "Internal server error" })
    }
});





// To delete the task  ↓  
app.delete('/tasks/:id', async (req, res) => {
    try {
        const taskId = req.params.id;
        const response = await Task.findByIdAndDelete(taskId);

        if (!response) {
            return res.status(404).json({ message: 'Task not found!' });
        }

        console.log(response);
        res.json({ Task: response, message: 'Task deleted successfully' });

    } catch (error) {
        console.error('Error deleting task', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});





// To edit exisiting task and update
app.patch('/tasks/:id', async (req, res) => {
    try {
        const taskId = req.params.id;
        const { title, description, dueDate, completed } = req.body; // Extract data from front end request

        if (!title || !description || !dueDate) {
            return res.status(400).json({ Error: "All fields are required!" })
        }

        const taskData = { title, description, dueDate, completed };
        const response = await Task.findByIdAndUpdate(taskId, taskData, { new: true });

        if (!response) {
            return res.status(404).json({ message: "Task not found" });
        }

        res.status(200).json({ message: 'Update successful', updatedTask: response });

    } catch (error) {
        console.error('Error: ', error);
        res.status(500).json();
    }
});





//--------------------- USER HANDLING ↓ ---------------------

// To create a user (Signup) ↓
app.post('/users/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body; // Extract data from front end request

        if (!firstName || !lastName || !email || !password) {                               // This checks if any input fields are blank in the signup form
            return res.status(400).json({ Error: "All fields are required!" })
        }

        // Checks for existing user in the database ↓

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ Error: 'Email already exists!' })
        }

        // Hashing the password for security ↓

        const saltRounds = 10;                   
        
        // Salt rounds determine how many times bcrypt will process (hash) the password before generating the final hash.
        // Salting adds random data to the password before hashing, making it more secure. Higher salt rounds = stronger security, but also more processing time.
        
        const hashedPassword = await bcrypt.hash(password, saltRounds);         // This hashes the password to be saved to the database
        
        const userData = { firstName, lastName, email, password: hashedPassword };                    // This is the data that will be saved to the 'User' Schema in the database (with the password now being hashed)
        const createUser = new User(userData); // Create new user model with extracted data

        const saveUser = await createUser.save(); // Save newly created user to the database

        req.session.userId = saveUser._id;      // This saves the '_id' object value of the 'User' schema in the database to the 'userId' property of the 'express-session' - this id will be used for logins etc.
        req.session.userName = saveUser.firstName;

        res.status(200).json({ message: 'User created successfully', user: saveUser });

    } catch (error) {
        console.error('Error: ', error);
        res.status(500).json();
    }
});





// To log a user in ↓

app.post('/users/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ Error: 'Email and password are required!' });
        }

        const user = await User.findOne({ email });

        if(!user) {
            return res.status(400).json({ Error: 'User not found!' });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ Error: 'Invalid credentials!' });
        }

        req.session.userId = user._id;
        req.session.userName = user.firstName;
        
        res.status(200).json({ message: 'Login successful' });

    } catch (error) {
        console.error('Error: ', error);
        res.status(500).json({ Error: 'Server error!' });
    }
});





// To log a user out and terminate the session ↓

app.post('/logout', async (req, res) => {

    req.session.destroy((err) => {                    // Destroys the session initiated when user first logged in
        if (err) {
            return res.status(500).json({ Error: 'Failed to destroy session' });
        }

        res.status(200).json({ message: 'Logout successful!' });
    });

}); 





// Used to start the server on port 3000
app.listen(port, () => {
    console.log(`To Do App listening on port ${port}`);
});


