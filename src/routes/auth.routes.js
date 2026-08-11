const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const authMiddleware=require("../middlewares/auth.middleware")
const authRouter = Router();

/**
 * @route POST /api/auth/register
 * @description Register new user
 * @access Public
 */
authRouter.post("/register", authController.registerUserController);

/**
 * @route POST /api/auth/verify-register-otp
 * @description Verify registration OTP and complete sign up
 * @access Public
 */
authRouter.post("/verify-register-otp", authController.verifyRegisterOtpController);

/**
 * @route POST /api/auth/login
 * @description login user with email and password
 * @access Public
 */
authRouter.post("/login",authController.loginUserController)

/**
 * @route POST /api/auth/logout
 * @description Logout the authenticated user and blacklist the JWT
 * @access Public
 */
authRouter.get("/logout", authController.logoutUserController);


/**
 * @route GET /api/aut/get-me
 * @description get the current logged in user details
 * @access Private
 */
authRouter.get("/get-me",authMiddleware.authUser,authController.getMecontroller)

module.exports = authRouter;
