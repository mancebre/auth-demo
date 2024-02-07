var express = require('express');
var perf = require('execution-time-async')();
var router = express.Router();
perf.config();

const User = require('../models/user');
const ensureAuthenticated = require('../middleware/authMiddleware');

/* GET home page . */
router.get('/', ensureAuthenticated, function (req, res, next) {
  const activeUser = req.user;
  User.find({}, function (err, users) {
    if (err) {
      return next(err);
    }
    res.render('index', {
      title: 'Members',
      users: users,
      isAdmin: activeUser.role === 'admin',
    });
  });
});
module.exports = router;
