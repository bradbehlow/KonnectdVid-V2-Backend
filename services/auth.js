import Jwt from "jsonwebtoken";

export const generateToken = (user) => {
  try {
    const payload = {
      accountId: user.accountId,
      userLocationId: user.userLocationId,
      companyId: user.companyId,
    };

    // const token = Jwt.sign(payload, process.env.JWT_SECRET, {
    //   expiresIn: "7d",
    // });
    const token = Jwt.sign(payload, process.env.JWT_SECRET);

    return token;
  } catch (error) {
    throw new Error(error);
  }
};
