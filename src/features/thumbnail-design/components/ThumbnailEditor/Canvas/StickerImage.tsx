import { Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { type ThumbnailObject } from '../../../../../store/thumbnailSlice';

export const StickerImage = ({ obj, commonProps }: { obj: ThumbnailObject, commonProps: any }) => {
  const [image] = useImage(obj.src || '', 'anonymous');
  return <KonvaImage image={image} {...commonProps} />;
};
