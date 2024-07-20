import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import OpenAI from "openai";
// models
import User from "./models/user.js";
import Cart from "./models/cart.js";
import Comment from "./models/comment.js";
import Order from "./models/order.js";
import Product from "./models/product.js";

dotenv.config();
const PORT = process.env.PORT || 5001;
const mongoDBURL = process.env.mongoDBURL;
const secretKey = process.env.secretKey;
const DOMAIN = process.env.domain || "http://localhost:5001";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI(OPENAI_API_KEY);

var limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 400, // max 100 requests per windowMs
});

const app = express();
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(cookieParser());
app.use(limiter);
app.use(express.json());

app.get("/", (request, response) => {
  console.log(request);
  return response.status(234).send("MSAID");
});

// TODO: we tried our best to make it so that it is case insensitive but it is not working
// low priority fix
app.post("/register", async (request, response) => {
  //console.log(request.body);
  const { username, password } = request.body;
  console.log(username, password);
  if (!username || !password) {
    return response.status(400).send("Usename and password are required");
  }
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const lower_username = username.toLowerCase();
    //create references to cart
    const new_cart = await Cart.create({});
    const new_user = {
      username: lower_username,
      password: password_hash,
      cartid: new_cart._id,
    };
    const user = await User.create(new_user);
    //console.log(user);
    const token = jwt.sign({ userId: user._id }, secretKey);
    response.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    return response.status(201).send("User created");
  } catch (error) {
    console.log(error);
    return response.status(409).send("Username already exists");
  }
});

app.post("/login", async (request, response) => {
  try {
    if (!request.body.username || !request.body.password) {
      return response.status(400).send("Username and password are required)");
    }
    const { username, password } = request.body;
    const lower_username = username.toLowerCase();
    const user = await User.findOne({ username: lower_username });
    if (!user) {
      return response.status(400).send("Invalid username or password");
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return response.status(400).send("Invalid username or password");
    }
    const token = jwt.sign({ userId: user._id }, secretKey);
    console.log(username, password);
    response.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    return response.status(200).send("User logged in");
  } catch (error) {
    consle.log(error);
  }
});

app.post("/logout", async (request, response) => {
  response.clearCookie("token");
  return response.status(200).send("User logged out");
});

app.post("/generate", async (request, response) => {
  //console.log(request.body.prompt);
  try {
    const promptInstructions =
      "You are an assistant that does nothing but respond to the prompt with a json object with variables price (float), description, stock(int), and name for a potential product. With no additional description or context";
    const chatContent = promptInstructions + request.body.prompt;
    const completion = await openai.chat.completions.create({
      messages: [{ role: "system", content: chatContent }],
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
    });
    //convert varibles to json
    const variables = JSON.parse(completion.choices[0].message.content);
    const name = variables.name;
    const price = variables.price;
    const description = variables.description;
    const stock = variables.stock;
    console.log(variables);
    // create an image from variable name
    const imageInstruction =
      "You are an assistant that does nothing but respond to the prompt with an image of the product based on the name the image must only contain a single item and be a product image with a white background this is the product name: ";
    const imagePrompt = imageInstruction + name;
    const imageCompletion = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    });
    const image_url = imageCompletion.data[0].b64_json;
    //create product
    const new_product = {
      name: name,
      price: price,
      image: image_url,
      countInStock: stock,
      description: description,
    };
    const product = await Product.create(new_product);
    return response
      .status(200)
      .send({ item: completion.choices[0].message.content, image: image_url });
  } catch (error) {
    console.log(error);
    return response.status(400).send("Error in generating response");
  }
});

app.get("/products", async (request, response) => {
  try {
    //fetch only one for testing
    const products = await Product.find();
    return response.status(200).send(products);
  } catch (error) {
    console.log(error);
    return response.status(400).send("Error in fetching products");
  }
});

mongoose
  .connect(mongoDBURL)
  .then(() => {
    console.log("Time is " + new Date() + "\nApp is connected to database");
    app.listen(PORT, () => {
      console.log(`App is listening to port: ${PORT}`);
    });
  })
  .catch((error) => {
    console.log(error);
  });
