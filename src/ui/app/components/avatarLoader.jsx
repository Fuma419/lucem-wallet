import { Box, Image } from '@chakra-ui/react';
import React from 'react';
import { avatarToImage } from '../../../api/extension';

const AvatarLoader = ({ avatar, width, smallRobot }) => {
  const [src, setSrc] = React.useState('');

  React.useEffect(() => {
    if (!avatar) {
      setSrc('');
      return undefined;
    }

    let blobUrl = null;
    if (Number(avatar)) {
      blobUrl = avatarToImage(avatar);
      setSrc(blobUrl);
    } else {
      setSrc(avatar);
    }

    return () => {
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [avatar]);

  const w = Number(avatar) && smallRobot ? '85%' : width;
  const h = Number(avatar) && smallRobot ? '85%' : width;

  return (
    <Box
      width={w}
      height={h}
      rounded="full"
      overflow="hidden"
      position="relative"
      bg="blackAlpha.400"
    >
      {src ? (
        <Image
          src={src}
          alt=""
          w="100%"
          h="100%"
          objectFit="cover"
          objectPosition="center"
          draggable={false}
        />
      ) : null}
    </Box>
  );
};

export default AvatarLoader;
