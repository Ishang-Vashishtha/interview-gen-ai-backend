const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { redisClient } = require("../config/redis");

/**
 *
 * @name registerUserController
 * @description register a new user, expects username,email, and password in the request body
 * @access Public
 */
async function registerUserController(req, res) {
  const { username, email, password } = req.body;
  if (!username || !password || !email) {
    return res
      .status(400)
      .json({ message: "please provide username, email, password" });
  }

  const isUserAlreadyExists = await userModel.findOne({
    $or: [{ username }, { email }],
  });

  if (isUserAlreadyExists) {
    if (isUserAlreadyExists.username === username) {
      return res.status(400).json({ message: "username already exist" });
    }
    return res.status(400).json({ message: "email already exist" });
  }
  const hash = await bcrypt.hash(password, 10);

  const user = await userModel.create({
    username,
    email,
    password: hash,
  });

  const token = jwt.sign(
    {
      id: user._id,
      username: user.username,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  });

  res.status(201).json({
    message: "user register successfully",
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
    },
  });
}

/**
 * @name loginUserController
 * @description login a user, expect email and password in request body
 * @access Public
 */
async function loginUserController(req, res) {
  const { email, password } = req.body;
  const user = await userModel.findOne({ email });

  if (!user) {
    return res.status(400).json({
      message: "User not found",
    });
  }
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return res.status(400).json({ message: "Invalid password" });
  }
  const token = jwt.sign(
    {
      id: user._id,
      username: user.username,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  });
  res.status(200).json({
    message: "User loggedIn successfully",
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
    },
  });
}

/**
 * @name logoutUserController
 * @description Logout the authenticated user by clearing the cookie and blacklisting the JWT
 * @access Public
 */
async function logoutUserController(req, res) {
  const token = req.cookies.token;

  if (token) {
    const decoded = jwt.decode(token);

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);

    if (ttl > 0) {
      await redisClient.set(token, "blacklisted", {
        EX: ttl,
      });
    }
  } else {
    return res.status(401).json({
      message: "Token not found",
    });
  }

  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  return res.status(200).json({
    message: "Logged out successfully",
  });
}

/**
 * @name getMecontroller
 * @description get the current logged in user details
 * @access Private
 */
async function getMecontroller(req, res) {
  const user = await userModel.findById(req.user.id);
  res.status(200).json({
    message: "User details fetched successfully",
    user: { id: user._id, username: user.username, email: user.email },
  });
}

module.exports = {
  registerUserController,
  loginUserController,
  logoutUserController,
  getMecontroller,
};
