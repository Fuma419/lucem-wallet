import React from 'react';
import QRCodeStyling from 'qr-code-styling';
import Ada from '../../../assets/img/ada.png';
import { useTheme, useColorModeValue, Box, Link } from '@chakra-ui/react';
import { getNetwork } from '../../../api/extension';  // Assuming you have this function

// Initialize QRCodeStyling
const qrCode = new QRCodeStyling({
  width: 240,
  height: 240,
  image: Ada,
  dotsOptions: {
    color: '#ffffff', // This will be updated dynamically
    type: 'dots',
  },
  cornersSquareOptions: { type: 'extra-rounded', color: '#DD6B20' }, // This will also be updated dynamically
  imageOptions: {
    crossOrigin: 'anonymous',
    margin: 8,
  },
});

const QrCode = ({ value }) => {
  const ref = React.useRef(null);
  const theme = useTheme(); // Access the theme object

  // Define network-based URLs
  const networkUrls = {
    mainnet: 'https://cexplorer.io',
    preprod: 'https://preprod.cexplorer.io',
    preview: 'https://preview.cexplorer.io',
  };

  const [networkUrl, setNetworkUrl] = React.useState(networkUrls.mainnet); // Default to mainnet

  // Fetch the network and set the URL accordingly
  React.useEffect(() => {
    async function fetchNetwork() {
      const network = await getNetwork();
      if (network.id === 'mainnet') {
        setNetworkUrl(networkUrls.mainnet);
      } else if (network.id === 'preprod') {
        setNetworkUrl(networkUrls.preprod);
      } else if (network.id === 'preview') {
        setNetworkUrl(networkUrls.preview);
      }
    }

    fetchNetwork();
  }, []);

  // Use theme-based dynamic colors
  const contentColor = useColorModeValue(
    {
      corner: theme.colors.cyan[500],
      dots: theme.colors.gray[900],
    },
    {
      corner: theme.colors.purple[500],
      dots: theme.colors.gray[900],
    }
  );

  // Append the QRCode when the component mounts
  React.useEffect(() => {
    qrCode.append(ref.current);
  }, []);

  // Update the QR code dynamically when the value, network URL, or colors change
  React.useEffect(() => {
    qrCode.update({
      data: `${networkUrl}/address/${value}`, // Use dynamic URL
      backgroundOptions: {
        color: theme.colors.cyan[600], // Set the background color using the theme
      },
      dotsOptions: {
        color: contentColor.dots, // Dynamic dots color
      },
      cornersSquareOptions: { color: contentColor.corner }, // Dynamic corner square color
    });
  }, [value, contentColor, networkUrl, theme.colors.cyan]);

  const qrCodeUrl = `${networkUrl}/address/${value}`; // Create the dynamic URL

  return (
    <Link href={qrCodeUrl} isExternal target="_blank" rel="noopener noreferrer">
      <Box
      background={theme.colors.cyan[600]}
      className='modal-glow-cyan'
      borderRadius="lg"  // Adds rounded corners to the outer container
        ref={ref}
      />
    </Link>
  );
};

export default QrCode;
