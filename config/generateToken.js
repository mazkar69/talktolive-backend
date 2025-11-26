import jwt from "jsonwebtoken";

const key = "thisismohdazkarwelcomeintheworldofcarding"
const generateToken = (id) => {
  return jwt.sign({ id }, key, {
    expiresIn: "30d",
  });
};

export default generateToken;
