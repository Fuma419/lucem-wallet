import { Box, Image } from '@chakra-ui/react';
import React from 'react';
import { avatarToImage } from '../../../api/extension';
import { HW } from '../../../config/config';
import KeystoneLogo from '../../../assets/img/imgKeystone.svg';
import LedgerLogo from '../../../assets/img/ledgerLogo.svg';
import TrezorLogo from '../../../assets/img/trezorLogo.svg';

// Hardware accounts store their device id as the avatar (set at import). Map it
// to the brand logo so every AvatarLoader call site — tray, accounts list,
// header, settings — shows the same icon without extra plumbing.
const HW_DEVICE_LOGOS = {
  [HW.keystone]: KeystoneLogo,
  [HW.ledger]: LedgerLogo,
  [HW.trezor]: TrezorLogo,
};

const AvatarLoader = ({ avatar, width, smallRobot }) => {
  const [src, setSrc] = React.useState('');
  const hwLogo = avatar ? HW_DEVICE_LOGOS[avatar] : null;

  React.useEffect(() => {
    if (!avatar) {
      setSrc('');
      return undefined;
    }

    // Brand logo asset URL — render straight through (no blob / dicebear).
    if (HW_DEVICE_LOGOS[avatar]) {
      setSrc(HW_DEVICE_LOGOS[avatar]);
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
      // Brand wordmarks are dark on transparent, so give them a light chip and
      // contain them; dicebear art fills the circle as before.
      bg={hwLogo ? 'white' : 'blackAlpha.400'}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          w="100%"
          h="100%"
          objectFit={hwLogo ? 'contain' : 'cover'}
          objectPosition="center"
          p={hwLogo ? '14%' : 0}
          draggable={false}
        />
      ) : null}
    </Box>
  );
};

export default AvatarLoader;
