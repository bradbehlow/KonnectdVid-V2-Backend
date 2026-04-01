import axios from "axios";
export const getAllUserContacts = async (user, userData, forEmail) => {

    var page = 1;
    var pageLimit = 10;
    var totalContacts = [];

    try {

        while (true) {

            const options = {
                method: "POST",
                url: "https://services.leadconnectorhq.com/contacts/search",
                headers: {
                Authorization: `Bearer ${userData.accessToken}`,
                Version: process.env.GHL_API_VERSION,
                "Content-Type": "application/json",
                Accept: "application/json",
                },
                data: {
                locationId: user.userLocationId,
                page: page,
                pageLimit: pageLimit,
                },
            };
        
            const { data } = await axios.request(options);
            totalContacts = [...totalContacts, ...data.contacts];

            if (page * pageLimit >= data.total) {
                break;
            }

            page++;
        }

        console.log("Total Contacts Fetched : ", totalContacts.length);

        if (forEmail === true) 
        {
            totalContacts = totalContacts.filter((contact) => (contact.email !== null && contact.email !== "" && contact.email !== undefined));
        }
        else
        {
            totalContacts = totalContacts.filter((contact) => (contact.phone !== null && contact.phone !== "" && contact.phone !== undefined));
        }

        console.log("Total Contacts after filtering : ", totalContacts.length);
        return totalContacts;
    }
    catch (error) {
    }
};  

export const filterContactsByTags = (contacts, tags) => {

    // console.log("Tags : ", tags);
    // console.log("Contacts : ", contacts);
    
    const result = contacts.filter((contact) => {
        return tags.some((tag) => contact.tags.includes(tag));
    });

    // console.log("Filtered Contacts : ", result);

    return result;
};
