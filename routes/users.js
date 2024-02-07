var express = require('express');
var router = express.Router();
var multer = require('multer');
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads');
  },
  filename: function (req, file, cb) {
    const ext = file.originalname.split('.').pop();
    cb(null, `${file.fieldname}-${Date.now()}.${ext}`);
  },
});

var upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Check file type
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  },
});

var User = require('../models/user');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var nodeMailer = require('nodemailer');
const { check, validationResult } = require('express-validator/check');
const ensureAuthenticated = require('../middleware/authMiddleware');
var ObjectId = require('mongoose').Types.ObjectId;
const fs = require('fs');
const { isAdmin, isOwner } = require('../util/auth');

/* GET users listing. */
router.get('/', function (req, res, next) {
  res.send('respond with a resource');
});
router.get('/register', function (req, res, next) {
  res.render('register', { title: 'Register' });
});
router.get('/login', function (req, res, next) {
  res.render('login', { title: 'Login' });
});
router.post(
  '/login',
  passport.authenticate('local', {
    failureRedirect: '/users/login',
    failureFlash: 'Invalid Credentials',
  }),
  function (req, res) {
    req.flash('success', 'You are now logged in');
    res.redirect('/');
  },
);

passport.serializeUser(function (user, done) {
  done(null, user.id);
});
passport.deserializeUser(function (id, done) {
  User.getUserById(id, function (err, user) {
    done(err, user);
  });
});
passport.use(
  new LocalStrategy(function (username, password, done) {
    User.getUserByUsername(username, function (err, user) {
      if (err) throw err;
      if (!user) {
        return done(null, false, { message: 'unknown user' });
      }
      User.comparePassword(password, user.password, function (err, isMatch) {
        if (err) return done(err);
        if (isMatch) {
          return done(null, user);
        } else {
          return done(null, false, { message: 'Invalid Password' });
        }
      });
    });
  }),
);

router.post(
  '/register',
  upload.single('profile'),
  [
    check('name', 'Name is empty!! Required').not().isEmpty(),
    check('email', 'Email required').not().isEmpty(),
    check('contact', 'contact length should be 10')
      .not()
      .isEmpty()
      .isLength({ max: 10 }),
  ],
  function (req, res, next) {
    var form = {
      person: req.body.name,
      email: req.body.email,
      contact: req.body.contact,
      uname: req.body.username,
      pass: req.body.password,
      role: req.body.role,
    };
    console.log(form);
    const errr = validationResult(req);
    if (!errr.isEmpty()) {
      console.log(errr);
      res.render('register', {
        title: 'Register',
        errors: errr.errors,
        form: form,
      });
    } else {
      var name = req.body.name;
      var email = req.body.email;
      var uname = req.body.username;
      var password = req.body.password;
      var contact = req.body.contact;
      var role = req.body.role;
      if (req.file) {
        profileimage = `${req.file.filename}`;
      } else {
        var profileimage = 'noimage.jpg';
      }
      var newUser = new User({
        name: name,
        email: email,
        password: password,
        profileimage: profileimage,
        uname: uname,
        contact: contact,
        role: role,
      });
      User.createUser(newUser, function () {
        console.log(newUser);
      });
      var transporter = nodeMailer.createTransport({
        service: 'Gmail',
        auth: {
          user: 'ankurlohiya3@gmail.com',
          pass: '******',
        },
      });
      var mailOptions = {
        from: 'Deepankur Lohiya<ankurlohiya3@gmail.com>',
        to: `${email}`,
        subject: 'Confirmation Email',
        text: 'You have been sucessfully registered with us',
        html: `<ul><li>Name:${name}</li><li>Mobile No.:${contact}</li><li>Profile:${profileimage}</li></ul>`,
      };
      transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
          console.log(err);
        } else {
          console.log(`Mail Sent at ${req.body.email}`);
        }
      });

      if (isAdmin(req.user)) {
        req.flash('success', 'You have successfully created a new user');
        return res.redirect('/');
      }

      res.location('/');
      res.redirect('./login');
    }
  },
);
router.get('/logout', function (req, res) {
  req.logout();
  req.flash('success', 'You are now logged out');
  res.redirect('/users/login');
});
const mongoose = require('mongoose');

router.post('/delete', ensureAuthenticated, async function (req, res) {
  try {
    var userId = req.body.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error('Invalid user ID');
      req.flash('error', 'Invalid user ID');
      return res.redirect('/');
    }

    // Get user from database
    const user = await User.findById(userId).exec();

    if (!user) {
      console.error('User not found');
      req.flash('error', 'User not found');
      return res.redirect('/');
    }

    if (!isAdmin(req.user)) {
      req.flash('error', 'Unauthorized access');
      return res.redirect('/');
    }

    // Delete user photo from uploads folder
    deleteUploadedFile(user.profileimage);

    await User.findByIdAndDelete(userId);
    req.flash('success', 'User deleted successfully');
    return res.redirect('/');
  } catch (err) {
    console.error('Error deleting user:', err);
    req.flash('error', 'Error deleting user');
    return res.redirect('/');
  }
});

router.get('/profile', ensureAuthenticated, async (req, res) => {
  try {
    // Get user id from URL query parameters
    const userId = req.query.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      req.flash('error', 'Invalid user ID');
      return res.redirect('/');
    }

    // Get user from database
    const user = await User.findById(userId).exec();
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/');
    }

    if (!isAdmin(req.user) && !isOwner(req.user, user)) {
      req.flash('error', 'Unauthorized access');
      return res.redirect('/');
    }

    // Render the profile view with the user object
    res.render('profile', {
      name: user.name,
      contact: user.contact,
      email: user.email,
      profileimage: user.profileimage,
      uname: user.uname,
      userId: userId,
      role: user.role,
    });
  } catch (err) {
    req.flash('error', 'An error occurred while fetching the user profile');
    res.redirect('/');
  }
});

router.post(
  '/update',
  ensureAuthenticated,
  upload.single('profile'),
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Email is required').not().isEmpty(),
    check('contact', 'Contact number must be 10 digits').isLength({
      min: 10,
      max: 10,
    }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    const form = {
      name: req.body.name,
      email: req.body.email,
      contact: req.body.contact,
      uname: req.body.username,
      deleteFile: req.body.deleteFile,
      profileimage: req.body.old_profileimage,
      userId: req.body.userId,
      role: req.body.role,
    };

    if (req.file) {
      form.profileimage = req.file.filename;
    }

    if (!errors.isEmpty()) {
      return res.render('profile', { errors: errors.array(), ...form });
    }

    try {
      const userId = ObjectId(req.body.userId);
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.error('Invalid user ID');
        req.flash('error', 'Invalid user ID');
        return res.render('profile', { ...form });
      }

      // Get user from database
      const user = await User.findById(userId).exec();

      if (!isAdmin(req.user) && !isOwner(req.user, user)) {
        req.flash('error', 'Unauthorized access');
        return res.redirect('/');
      }

      await User.findByIdAndUpdate(userId, {
        name: form.name,
        email: form.email,
        contact: form.contact,
        uname: form.uname,
        profileimage: form.deleteFile ? 'noimage.jpg' : form.profileimage,
        role: form.role,
      });

      if (form.deleteFile === 'on') {
        deleteUploadedFile(form.profileimage);
      } else if (req.body.old_profileimage !== form.profileimage) {
        deleteUploadedFile(req.body.old_profileimage);
      }

      req.flash('success', 'User updated successfully');
      res.redirect('/');
    } catch (error) {
      console.error(error);
      req.flash(
        'error',
        'An error occurred while updating the user, please try again',
      );
      return res.render('profile', { ...form });
    }
  },
);

router.get('/add', ensureAuthenticated, async (req, res) => {
  // Get user from database
  const user = await User.findById(req.body.userId).exec();

  if (!isAdmin(req.user)) {
    req.flash('error', 'Unauthorized access');
    return res.redirect('/');
  }

  res.render('register', { title: 'Add New User' });
});

const deleteUploadedFile = (fileName) => {
  if (!fileName || fileName === 'noimage.jpg') {
    return;
  }

  fs.unlink(`./uploads/${fileName}`, (err) => {
    if (err) {
      console.error(err);
    }
  });
};

module.exports = router;
