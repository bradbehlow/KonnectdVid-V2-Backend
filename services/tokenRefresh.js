import userModel from "../models/userModel.js";
import axios from "axios";
import { URLSearchParams } from 'url';

export const refreshAllGHLAccessTokens = async (req, res) => {
    try
    {
        let rateLimitCount = 0;
        //Finding Agency Accounts (1 Per CompanyId ith greatest expiryDate)
        const latestAgencys = await userModel.aggregate([
            {
              $match: {
                userLocationId: ""
              }
            },
            {
              $sort: {
                expiryDate: -1 // Sort by expiryDate descending (latest first)
              }
            },
            {
              $group: {
                _id: "$companyId",
                doc: { $first: "$$ROOT" } // Take the first document per companyId
              }
            },
            {
              $replaceRoot: {
                newRoot: "$doc" // Flatten the result
              }
            },
        ]);

        // console.log(latestAgencys);

        // const latestSubAccounts = await userModel.aggregate([
        //     {
        //       $match: {
        //         userLocationId: { $ne: "" },
        //         companyId: latestAgencys[0].companyId
        //       }
        //     },
        //     {
        //       $sort: {
        //         expiryDate: -1 // Sort by expiryDate descending (latest first)
        //       }
        //     },
        //     {
        //       $group: {
        //         _id: "$userLocationId",
        //         doc: { $first: "$$ROOT" } // Take the first document per userLocationId
        //       }
        //     },
        //     {
        //       $replaceRoot: {
        //         newRoot: "$doc" // Flatten the result
        //       }
        //     },
        // ]);

        // console.log(latestSubAccounts.length);
        // return res.status(200).send({message: "Access tokens refreshed successfully!"});

        for(let i = 0; i < latestAgencys.length; i++)
        {
            const agencyAccount = latestAgencys[i];
            let agencyAccesstoken;

            const encodedParams = new URLSearchParams();
            encodedParams.set('client_id', process.env.GHL_CLIENT_ID);
            encodedParams.set('client_secret', process.env.GHL_CLIENT_SECRET);
            encodedParams.set('grant_type', 'refresh_token');
            encodedParams.set('refresh_token', agencyAccount.refreshToken);
            encodedParams.set('user_type', 'Company');

            const options = {
            method: 'POST',
            url: 'https://services.leadconnectorhq.com/oauth/token',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            },
            data: encodedParams,
            };

            // Delay to avoid rate limit
            if (rateLimitCount % 5 === 0 && rateLimitCount > 0) {
                console.log('Delaying 1 second after 5 requests...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const { data } = await axios.request(options);

            rateLimitCount++;

            let newexpiryDate = new Date();
            newexpiryDate.setSeconds(newexpiryDate.getSeconds() + (data.expires_in - 60));

            agencyAccesstoken = data.access_token;

            await userModel.updateMany(
                { userLocationId: "", companyId: agencyAccount.companyId },
                { accessToken: agencyAccesstoken, refreshToken: data.refresh_token, expiryDate: newexpiryDate, scope: data.scope }
            );

            // Finding Sub Accounts (1 Per CompanyId ith greatest expiryDate)
            const latestSubAccounts = await userModel.aggregate([
                {
                  $match: {
                    userLocationId: { $ne: "" },
                    // userLocationId: "CWWHglksQdwc75IHsRlw",
                    companyId: agencyAccount.companyId
                  }
                },
                {
                  $sort: {
                    expiryDate: -1 // Sort by expiryDate descending (latest first)
                  }
                },
                {
                  $group: {
                    _id: "$userLocationId",
                    doc: { $first: "$$ROOT" } // Take the first document per userLocationId
                  }
                },
                {
                  $replaceRoot: {
                    newRoot: "$doc" // Flatten the result
                  }
                },
            ]);

            for(let j = 0; j < latestSubAccounts.length; j++)
            {
                const subAccount = latestSubAccounts[j];

                // Delay to avoid rate limit
                if (rateLimitCount % 5 === 0 && rateLimitCount > 0) {
                    console.log('Delaying 1 second after 5 requests...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                try {
                  const locationTokenResponse = await axios.post(
                      "https://services.leadconnectorhq.com/oauth/locationToken",
                      new URLSearchParams({
                          companyId: agencyAccount.companyId,
                          locationId: subAccount.userLocationId,
                      }),
                      {
                          headers: {
                              "Content-Type": "application/x-www-form-urlencoded",
                              Accept: "application/json",
                              Version: "2021-07-28",
                              Authorization: `Bearer ${agencyAccesstoken}`,
                          },
                      }
                  );
              
                  rateLimitCount++;
              
                  const locationTokenData = locationTokenResponse.data;
              
                  const expiryDate = new Date();
                  expiryDate.setSeconds(expiryDate.getSeconds() + (locationTokenData.expires_in - 60));
              
                  await userModel.updateMany(
                      { userLocationId: subAccount.userLocationId },
                      {
                          accessToken: locationTokenData.access_token,
                          refreshToken: locationTokenData.refresh_token,
                          expiryDate: expiryDate,
                          scope: locationTokenData.scope,
                      }
                  );
              } catch (error) {
                  console.error(
                      `Failed to fetch/update token for userLocationId ${subAccount.userLocationId}:`,
                      error.response?.data || error.message
                  );
                  continue; // Skip to next subAccount
              }
            }
        }

        return res.status(201).send({message: "Access tokens refreshed successfully!"});

    }
    catch(error)
    {
        console.log(error);
        return res.status(400).send({message: "Failed to refresh access tokens!", error});
    }
};