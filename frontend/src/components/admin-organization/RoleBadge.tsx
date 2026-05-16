import { memo } from "react";
import { Badge } from "../ui/badge";

interface RoleBadgeProps {
  role: string;
}

export const RoleBadge = memo(function RoleBadge({ role }: RoleBadgeProps) {
  switch (role) {
    case "admin":
      return (
        <Badge className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/50">
          Administrator
        </Badge>
      );
    case "analityk":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border-yellow-500/50">
          Analityk
        </Badge>
      );
    default:
      return (
        <Badge className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-blue-500/50">
          Pracownik
        </Badge>
      );
  }
});