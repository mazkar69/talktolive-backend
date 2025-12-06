import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";
import generateToken from "../config/generateToken.js";
import jwt from "jsonwebtoken";


const allUsers = asyncHandler(async (req, res) => {
  const filter = req.query.search
    ? {
      $or: [
        { name: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
      ],
    }
    : {};

  const users = await User.find(filter).find({ _id: { $ne: req.user._id } });

  

  res.send(users);
});



const registerUser = asyncHandler(async (req, res) => {

  const { countryCode, name, email, password, pic } = req.body;

  if (!countryCode || !name || !email || !password) {
    res.status(400);
    throw new Error("Please Enter all the Feilds");
  }

  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  const user = await User.create({
    countryCode,
    name,
    email,
    password,
    pic,
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      countryCode: user.countryCode,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      pic: user.pic,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error("User not found");
  }
});



//This function wil run when user will login. "/login" This is the post route.
const authUser = asyncHandler(async (req, res) => {
  console.log("Hitted login route");
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      countryCode: user.countryCode,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      pic: user.pic,
      token: generateToken(user._id),
    }).status(200);
  } else {
    res.status(401);
    throw new Error("Invalid Email or Password");
  }
});


const verifyToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  try {
    const decoded = jwt.verify(token, "thisismohdazkarwelcomeintheworldofcarding");

    const user = await User.findById(decoded.id).select("-password");

    if (user) {
      res.status(200).json({ ...user.toJSON(), token });
    } else {
      res.status(401);
      throw new Error("User not found");
    }
  } catch (error) {
    res.status(401);
    throw new Error("Invalid Token");
  }
});

export { registerUser, authUser, allUsers, verifyToken };