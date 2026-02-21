import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

// Get user profile data
export const getProfile = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Fetch user data with profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
        profile: {
          select: {
            fullName: true,
            heightCm: true,
            targetWeightKg: true,
            latestWeightKg: true,
            unitPref: true,
            dateOfBirth: true,
            gender: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update user profile
export const updateProfile = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      fullName,
      heightCm,
      targetWeightKg,
      unitPref,
      dateOfBirth,
      gender,
    } = req.body;

    // Validate enum values if provided
    if (unitPref && !["kg", "lbs"].includes(unitPref)) {
      res
        .status(400)
        .json({ error: "Invalid unit preference. Must be 'kg' or 'lbs'" });
      return;
    }

    if (gender && !["male", "female", "other"].includes(gender)) {
      res
        .status(400)
        .json({
          error: "Invalid gender. Must be 'male', 'female', or 'other'",
        });
      return;
    }

    // Check if profile exists
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    let profile;
    if (existingProfile) {
      // Update existing profile
      profile = await prisma.userProfile.update({
        where: { userId },
        data: {
          ...(fullName !== undefined && { fullName }),
          ...(heightCm !== undefined && { heightCm: parseFloat(heightCm) }),
          ...(targetWeightKg !== undefined && {
            targetWeightKg: parseFloat(targetWeightKg),
          }),
          ...(unitPref && { unitPref }),
          ...(dateOfBirth !== undefined && {
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          }),
          ...(gender !== undefined && { gender }),
        },
      });
    } else {
      // Create new profile
      profile = await prisma.userProfile.create({
        data: {
          userId,
          fullName: fullName || null,
          heightCm: heightCm ? parseFloat(heightCm) : null,
          targetWeightKg: targetWeightKg ? parseFloat(targetWeightKg) : null,
          unitPref: unitPref || "kg",
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender: gender || null,
        },
      });
    }

    res.status(200).json(profile);
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update username
export const updateUsername = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { username } = req.body;

    if (!username) {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    // Check if username is already taken
    const existingUser = await prisma.user.findFirst({
      where: {
        username,
        NOT: { id: userId },
      },
    });

    if (existingUser) {
      res.status(400).json({ error: "Username already taken" });
      return;
    }

    // Update username
    const user = await prisma.user.update({
      where: { id: userId },
      data: { username },
      select: {
        id: true,
        username: true,
        email: true,
      },
    });

    res.status(200).json(user);
  } catch (error) {
    console.error("Update Username Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
