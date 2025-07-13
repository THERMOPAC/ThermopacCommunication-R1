import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Globe, MapPin, Wifi } from "lucide-react";

interface TimezoneInfo {
  timezone: string;
  country: string;
  city: string;
  ip: string;
  detectionMethod: 'geoip' | 'header' | 'fallback';
  confidence: 'high' | 'medium' | 'low';
}

interface TimezoneResponse {
  success: boolean;
  timezone: TimezoneInfo;
  offset: number;
  serverTime: string;
  userLocalTime: string;
}

export default function TimezoneDetector() {
  const { data: timezoneData, isLoading, error } = useQuery<TimezoneResponse>({
    queryKey: ['/api/timezone/detect'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const getConfidenceBadgeColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'bg-green-100 text-green-800 border-green-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'geoip': return <Wifi className="h-4 w-4" />;
      case 'header': return <Globe className="h-4 w-4" />;
      case 'fallback': return <Clock className="h-4 w-4" />;
      default: return <Globe className="h-4 w-4" />;
    }
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'geoip': return 'IP Geolocation';
      case 'header': return 'Browser Language';
      case 'fallback': return 'System Default';
      default: return 'Unknown';
    }
  };

  if (isLoading) {
    return (
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Detecting Your Timezone...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !timezoneData?.success) {
    return (
      <Card className="border-red-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-red-600">
            <Clock className="h-5 w-5" />
            Timezone Detection Failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">
            Unable to detect your timezone automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { timezone, offset, serverTime, userLocalTime } = timezoneData;

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600" />
          Auto-Detected Timezone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary timezone info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-gray-500" />
            <span className="font-medium">{timezone.timezone}</span>
          </div>
          <Badge className={getConfidenceBadgeColor(timezone.confidence)}>
            {timezone.confidence} confidence
          </Badge>
        </div>

        {/* Location info */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="h-4 w-4" />
          <span>{timezone.city}, {timezone.country}</span>
        </div>

        {/* Detection method */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {getMethodIcon(timezone.detectionMethod)}
          <span>via {getMethodLabel(timezone.detectionMethod)}</span>
        </div>

        {/* Time comparison */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Your Local Time:</span>
            <span className="font-medium">{userLocalTime}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Server Time (UTC):</span>
            <span className="font-medium">{new Date(serverTime).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">UTC Offset:</span>
            <span className="font-medium">
              {offset > 0 ? '+' : ''}{offset} hours
            </span>
          </div>
        </div>

        {/* IP info (for debugging) */}
        <div className="text-xs text-gray-500 border-t pt-2">
          Detected from IP: {timezone.ip}
        </div>
      </CardContent>
    </Card>
  );
}