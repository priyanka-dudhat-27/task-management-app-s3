import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/userModel.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";


const generateAccessAndRefreshToken=async(userId)=>{
  try {
    const user=await User.findById(userId);
    const accessToken=user.generateAccessToken()
    const refreshToken=user.generateRefreshToken()

    user.refreshToken=refreshToken
    await user.save({validateBeforeSave:false})

    return  {accessToken,refreshToken}

  } catch (error) {
    throw new ApiError(500,"Something went wrong while generating refresh and access token")
  }
}

const registerUser = asyncHandler(async (req, res) => {
  //get user details from frontend
  //validation-not empty
  //user already exist -chek by email or username
  //check for files(images)/check for avtar
  //upload them to cloudinary,avtar
  //create user object-create entry in db
  //remove password and refresh token from response- for send to frontend
  //check for user creation or null
  //return res
  const { fullname, email, username, password } = req.body;

  // if(fullname===""){
  //     throw new ApiError(400,"fullname is required")
  // }

  if (
    [fullname, email, username, password].some(
      (field) => !field || field.trim() === ""
    )
  ) {
    throw new ApiError(400, "All fields are required and must not be empty");
  }

  const existedUser =await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exist");
  }

  const avtarLocalPath = req.files?.avtar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;
  if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avtarLocalPath) {
    throw new ApiError(400, "Avtar file is required");
  }

  const avtar = await uploadOnCloudinary(avtarLocalPath);

// Only upload the cover image if it exists
let coverImage;
if (coverImageLocalPath) {
  coverImage = await uploadOnCloudinary(coverImageLocalPath);
}
  

  if (!avtar) {
    throw new ApiError(400, "Avtar file is required");
  }

  const user = await User.create({
    fullname,
    avtar: avtar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wriong while register the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

// login
const loginUser=asyncHandler(async(req,res)=>{
    //req body=>data
    //username or email
    //find the user
    //check password
    //access and refresh token
    //send cookie

    console.log(req.body);

    const {email,username,password}=req.body;

    if (!username && !email) {
      throw new ApiError(400, "username or email is required");
  }

    const user=await User.findOne({
      $or:[{username},{email}]
    })

    if(!user){
      throw new ApiError(404,"user does not exist")
    }

    const isPasswordValid=await user.isPasswordCorrect(password)

    if(!isPasswordValid){
      throw new ApiError(401,"Invalid password")
    }

    const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id)

    const loggedInUser=await User.findById(user._id).select("-password -refreshToken")

    //cookies
    const options={
      httpOnly: true,
      secure:true
    }

    return res.status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
      new ApiResponse(200,
        {
          user:loggedInUser,accessToken,refreshToken
        },
        "user Logged in successfully"
      )
    )

})

// logout 
const logoutUser=asyncHandler(async(req,res)=>{
     User.findByIdAndUpdate(
      req.user._id,
      {
          $unset:{
            refreshToken:1 //this removes the field from document
          }
      },
      {
        new:true
      }
     )

     const options={
      httpOnly:true,
      secure:true
     }

     return res
     .status(200)
     .clearCookie("accessToken",options)
     .clearCookie("refreshToken",options)
     .json(new ApiResponse(200,{},"User Loggedout successfully"))
})

// refresh access Token api
const refreshAccessToken =asyncHandler(async(req,res)=>{
    const incomingRefreshToken=req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
      throw new ApiError(401,"Unauthorized request")
    }

   try {
     const decodedToken=jwt.verify(
       incomingRefreshToken,
       process.env.REFRESH_TOKEN_SECRET
     )
 
     const user=await User.findById(decodedToken?._id)
 
     if(!user){
       throw new ApiError(401,"Invalid refresh token")
     }
 
     if(incomingRefreshToken !== user?.refreshToken){
       throw new ApiError(401,"Refresh token is expired or used")
     }
 
     const options={
       httpOnly:true,
       secure:true
     }
 
     const {accessToken,newRefreshToken}=await generateAccessAndRefreshToken(user._id)
 
     return res.status(200)
     .cookie("accessToken",accessToken)
     .cookie("refreshToken",newRefreshToken)
     .json(
       200,
       {accessToken,refreshToken:newRefreshToken,message:"Access Token Refreshed"},
     )
   } catch (error) {
      throw new ApiError(401,error?.message || "Invalid Refresh Token")
   }

  })

  // change current password
  const changeCurrentPassword=asyncHandler(async(req,res)=>{
      const {oldPassword,newPassword}=req.body;

      // const {confPassword}=req.body;
      // if(!(newPassword ===confPassword)){
      //   throw new ApiError("400","confirm password and new password not match")
      // }

      const user=await User.findById(req.user?._id)
      const isPasswordCorrect=await user.isPasswordCorrect(oldPassword);
  
      if(!isPasswordCorrect){
        throw new ApiError(400,"Invalid old password")
      }

      user.password=newPassword;
      await user.save({validateBeforeSave:flase})
      
      return res
      .status(200)
      .json(new ApiResponse(200,{},"Password updated successfully"))
    })

    const getCurrentUser=asyncHandler(async(req,res)=>{
      return res
      .status(200)
      .json(new ApiResponse(200,req.user,"Current user fetched successfully"))
    })

    //update account details
    const updateAccountDetails=asyncHandler(async(req,res)=>{
      const {fullname,email} = req.body;

      if(!fullname || !email){
        throw new ApiError(400,"All  fields are required")
      }

     const user= await User.findByIdAndUpdate(
        req.user?._id,
        {
          $set:{
            fullname:fullname,
            email:email,
          }
        },
        {new:true}
      ).select("-password")

      return res.status(200)
      .json(new ApiResponse(200,"Account details updated successfully"))
    })

  //update user avtar
  const updateUserAvtar=asyncHandler(async(req,res)=>{
    const avtarLocalPath=req.file?.path
    if(!avtarLocalPath){
      throw new ApiError(400,"Avtar file is missing")
    }

    //set previoue image delet utilites .......todo task 

    const avtar=await uploadOnCloudinary(avtarLocalPath)

    if(!avtar.url){
      throw new ApiError(400,"Error while uploading on avtar")
    }

    //update
    await User.findByIdAndUpdate(
      req.user._id,
      {
        $set:{
          avtar:avtar.url
        }
      },
      {new:true}
    ).select("-password")
  })

  //update cover image
  const updateUserCoverImage=asyncHandler(async(req,res)=>{
    const coverImageLocalPath=req.file?.path
    if(!coverImageLocalPath){
      throw new ApiError(400,"Avtar file is missing")
    }

        //set previoue image delet utilites .......todo task


    const coverImage=await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url){
      throw new ApiError(400,"Error while uploading on avtar")
    }

    //update
    await User.findByIdAndUpdate(
      req.user._id,
      {
        $set:{
          coverImage:coverImage.url
        }
      },
      {new:true}
    ).select("-password")
  })

  //get userchannel profile
  const getUserChannelProfile=asyncHandler(async(req,res)=>{
      const {username}=req.params

      if(!username?.trim()){
        throw new ApiError(400,"username is missing")
      }

      const channel=await User.aggregate([
        //match uservname pipeline
        {
          $match:{
            username:username?.toLowercase()
          }
        },
        //values of subscribers
        {
          $lookup:{
            from:"subscriptions",
            localFields:"_id",
            foreignField:"channel",
            as:"subscribers"
          }
        },
        //value of subscribed channel
        {
          $lookup:{
            from:"subscriptions",
            localFields:"_id",
            foreignField:"subscriber",
            as:"subscribedTo"
          }
        },
        //add fields in single object
        {
          $addFields:{
            subscribersCount:{
              $size:"$subscribers",          
            },
            channelsSubscribedToCount:{
              $size:"$subscribedTo"
            },
            isSubscribed:{
              $cond:{
                if:{$in:[req.user?._id,"$subscribers.subscriber"]},
                then:true,
                else:false
              }
            }
          }
        },
        //which fields value want tojoin
        {
          $project:{
            fullname:1,
            username:1,
            subscribersCount:1,
            channelsSubscribedToCount:1,
            isSubscribed:1,
            avtar:1,
            coverImage:1,
            email:1   
          }
        }
      ])

      if(!channel?.length){
        throw new ApiError(404,"channel does not exist")
      }

      return res
      .status(200)
      .json(
        new ApiResponse(200,channel[0],"User channel fetched successfully")
      )
  })

  //watch history
  const getWatchHistory=asyncHandler(async(req,res)=>{
   
    const user=await User.aggregate([
      {
        $match:{
        // Use the constructor directly with the inputId
          _id:mongoose.Types.ObjectId(req.user._id)
        }
      },
      {
        $lookup:{
          from:"Video",
          localField:"watchHistory",
          foreignField:"_id",
          as:"watchHistory",
          pipeline:[
            {
              $lookup:{
                from:"User",
                localField:"owner",
                foreignField:"_id",
                as:"owner",
                pipeline:[
                  {
                    $project:{
                      fullname:1,
                      username:1,
                      avtar:1,
                    }
                  }
                ]
              }
            },
            {
              $addFields:{
                owner:{
                  $first:"$owner"
                }
              }
            }
          ]
        }
      }
    ])

    return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    )
       
  })

  
export { 
  registerUser ,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvtar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory
};
