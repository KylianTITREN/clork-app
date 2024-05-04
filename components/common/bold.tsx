import { Text, useTheme } from "react-native-paper";

const Bold = ({
  children,
  colorized,
}: {
  children: any;
  colorized?: boolean;
}) => {
  const { colors } = useTheme();

  return (
    <Text
      style={{
        fontFamily: "Arvo-Bold",
        color: colorized ? colors.primary : undefined,
      }}
    >
      {children}
    </Text>
  );
};

export default Bold;
