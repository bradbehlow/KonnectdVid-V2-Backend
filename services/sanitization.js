export const sanitizeUser = (user) => {
    const sanitizedUser = { ...user._doc }; // Clone the user object
    delete sanitizedUser.password;
    delete sanitizedUser.salt;
    return sanitizedUser;
};