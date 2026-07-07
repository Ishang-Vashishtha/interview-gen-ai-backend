const jwt = require("jsonwebtoken");
const { redisClient } = require("../config/redis");
require("dotenv").config();

async function authUser(req, res, next) {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({
            message: "token not provided"
        });
    }
    try {
        const isBlacklisted = await redisClient.exists(token);
        if (isBlacklisted) {
            return res.status(401).json({
                message: "Token has been revoked",
            });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid    token" });
    }
}

module.exports = { authUser }
