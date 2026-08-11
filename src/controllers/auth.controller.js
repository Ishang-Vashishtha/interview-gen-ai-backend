const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
require("dotenv").config();
const { redisClient } = require("../config/redis");
const sendEmail = require("../utils/sendEmail");

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

async function sendRegistrationOtpEmail({ email, username, otp }) {
  await sendEmail({
    to: email,
    subject: "Verify your email address",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2>Verify your email</h2>
        <p>Hi ${username},</p>
        <p>Your verification code is:</p>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">${otp}</div>
        <p>This code expires in 10 minutes.</p>
      </div>
    `,
  });
}

function setAuthCookie(res, user) {
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
    maxAge: 24 * 60 * 60 * 1000,
  });
}

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

  const userByEmail = await userModel.findOne({ email });
  const userByUsername = await userModel.findOne({ username });

  if (
    userByUsername &&
    (!userByEmail ||
      userByUsername._id.toString() !== userByEmail._id.toString())
  ) {
    return res.status(400).json({ message: "username already exist" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);

  let user;

  if (userByEmail) {
    if (userByEmail.isVerified) {
      return res.status(400).json({ message: "email already exist" });
    }
    userByEmail.username = username;
    userByEmail.password = passwordHash;
    userByEmail.isVerified = false;
    userByEmail.otp = otpHash;
    userByEmail.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    user = await userByEmail.save();
  } else {
    user = await userModel.create({
      username,
      email,
      password: passwordHash,
      isVerified: false,
      otp: otpHash,
      otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
  }

  try {
    await sendRegistrationOtpEmail({ email, username, otp });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to send OTP email. Please try again.",
    });
  }

  return res.status(201).json({
    message: "OTP sent to your email. Please verify to complete registration.",
    requiresVerification: true,
    email: user.email,
  });
}

async function verifyRegisterOtpController(req, res) {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "please provide email and otp" });
  }

  const user = await userModel.findOne({ email });

  if (!user) {
    return res.status(404).json({ message: "user not found" });
  }

  if (user.isVerified) {
    return res.status(400).json({ message: "Email already verified" });
  }

  if (
    !user.otp ||
    !user.otpExpiresAt ||
    user.otpExpiresAt.getTime() < Date.now()
  ) {
    return res
      .status(400)
      .json({
        message: "OTP expired. Please register again to get a new code.",
      });
  }

  const isOtpValid = await bcrypt.compare(String(otp), user.otp);

  if (!isOtpValid) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  user.isVerified = true;
  user.otp = null;
  user.otpExpiresAt = null;
  await user.save();

  setAuthCookie(res, user);

  return res.status(200).json({
    message: "Email verified successfully",
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
  // console.log("LOGIN HIT", req.body);
  const { email, password } = req.body;
  const user = await userModel.findOne({ email });

  if (!user) {
    return res.status(400).json({
      message: "User not found",
    });
  }
  if (!user.isVerified) {
    return res.status(403).json({
      message: "Please verify your email before logging in",
    });
  }
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return res.status(400).json({ message: "Invalid password" });
  }
  setAuthCookie(res, user);
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
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  const user = await userModel.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  res.status(200).json({
    message: "User details fetched successfully",
    user: { id: user._id, username: user.username, email: user.email },
  });
}

module.exports = {
  registerUserController,
  verifyRegisterOtpController,
  loginUserController,
  logoutUserController,
  getMecontroller,
};
