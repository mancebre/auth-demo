const isAdmin = (currentUser) => {
    return currentUser && currentUser.role === 'admin';
}

const isOwner = (profile, currentUser) => {
    console.log(profile, currentUser);
    return profile._id.toString() === currentUser._id.toString();
}

module.exports = { isAdmin, isOwner }