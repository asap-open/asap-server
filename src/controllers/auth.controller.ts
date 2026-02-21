import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";
const TOKEN_EXP = process.env.TOKEN_EXP || "7d";
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fullName, username, email, password } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      res.status(400).json({ error: "Username or email already in use" });
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
      },
    });

    // Create user profile with full name if provided
    if (fullName) {
      await prisma.userProfile.create({
        data: {
          userId: newUser.id,
          fullName,
        },
      });
    }

    // Generate Token
    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, {
      expiresIn: TOKEN_EXP as jwt.SignOptions["expiresIn"],
    });

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const signin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body; // identifier = email OR username

    if (!identifier || !password) {
      res
        .status(400)
        .json({ error: "Username/Email and password are required" });
      return;
    }

    // Find user by Email OR Username
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Generate Token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Signin error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ message: "Logout successful" });
};
