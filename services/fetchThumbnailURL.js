import axios from "axios";

export const fetchThumbnailURL = async (videoUrl) => {
  try {
    const response = await axios.get(
      `https://www.loom.com/v1/oembed?url=${encodeURIComponent(videoUrl)}`
    );
    return response.data;
  } catch (error) {
    return (
      error.response?.data?.message ||
      "An unexpected error occurred while fetching the thumbnail URL"
    );
  }
};
