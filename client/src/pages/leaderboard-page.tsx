import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Award, Medal, Sparkles, TrendingUp, Trophy, Users } from "lucide-react";
import { useState } from "react";
import { type ProductivityMetric, type Achievement, type UserAchievement } from "@shared/schema";
import Layout from "@/components/layout";

// Badge display component
const AchievementBadge = ({ 
  name, 
  description, 
  category, 
  icon, 
  level = 1,
  earnedAt
}: Achievement & { level?: number, earnedAt?: string }) => {
  // Set icon based on category
  const IconComponent = () => {
    switch (category) {
      case 'task':
        return <TrendingUp className="h-6 w-6" />;
      case 'productivity':
        return <Sparkles className="h-6 w-6" />;
      case 'collaboration':
        return <Users className="h-6 w-6" />;
      case 'leadership':
        return <Trophy className="h-6 w-6" />;
      default:
        return <Award className="h-6 w-6" />;
    }
  };

  // Determine badge color based on category
  const getBadgeColor = () => {
    switch (category) {
      case 'task': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'productivity': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'collaboration': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'leadership': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <div className="flex flex-col items-center p-4 border rounded-lg shadow-sm bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
      <div className={`rounded-full p-3 mb-3 ${getBadgeColor()}`}>
        <IconComponent />
      </div>
      <h3 className="text-lg font-semibold mb-1">{name}</h3>
      {level > 1 && (
        <Badge variant="outline" className="mb-2">
          Level {level}
        </Badge>
      )}
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-2">{description}</p>
      {earnedAt && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Earned on {new Date(earnedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
};

// User card component for leaderboard
const UserScoreCard = ({ 
  rank, 
  metric, 
  isCurrentUser 
}: { 
  rank: number; 
  metric: any; 
  isCurrentUser: boolean 
}) => {
  // Medal icons for top 3
  const getMedalIcon = () => {
    if (rank === 1) return <Medal className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
    return <span className="w-5 text-center font-semibold">{rank}</span>;
  };

  // For debugging
  console.log('UserScoreCard rendering with metric:', metric);

  // Since the server returns different formats, we need to handle both
  const username = metric.userDetails?.username || 'Unknown User';
  const role = metric.userDetails?.role || '';
  const score = metric.weeklyScore || 0;
  const tasksCompleted = metric.tasksCompleted || 0;

  return (
    <div className={`flex items-center p-3 border-b last:border-b-0 ${isCurrentUser ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}>
      <div className="flex items-center justify-center w-8">
        {getMedalIcon()}
      </div>
      <div className="flex-grow ml-3">
        <p className="font-medium">{username}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {role}
        </p>
      </div>
      <div className="flex flex-col items-end">
        <p className="font-semibold">{score} pts</p>
        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
          <span>{tasksCompleted} tasks</span>
        </div>
      </div>
    </div>
  );
};

// Stats summary card
const StatCard = ({ title, value, icon }: { title: string; value: number | string; icon: React.ReactNode }) => {
  return (
    <Card>
      <CardContent className="flex flex-row items-center pt-6">
        <div className="bg-primary/10 p-3 rounded-full mr-4">{icon}</div>
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('team');
  const userId = user?.id;

  // Query for productivity metrics
  const { data: metrics, isLoading: isMetricsLoading } = useQuery({
    queryKey: ['/api/productivity'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/productivity');
      return res.json();
    },
    enabled: !!userId,
  });

  // Query for the user's rank
  const { data: rankData, isLoading: isRankLoading } = useQuery({
    queryKey: ['/api/leaderboard/my-rank'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/leaderboard/my-rank');
      return res.json();
    },
    enabled: !!userId,
  });

  // Query for team leaderboard
  const { data: teamLeaderboard, isLoading: isTeamLoading } = useQuery({
    queryKey: ['/api/leaderboard/team'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/leaderboard/team');
      const data = await res.json();
      console.log('Team leaderboard data:', data);
      return data;
    },
    enabled: !!userId,
  });

  // Query for company-wide leaderboard
  const { data: companyLeaderboard, isLoading: isCompanyLoading } = useQuery({
    queryKey: ['/api/leaderboard/company'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/leaderboard/company');
      return res.json();
    },
    enabled: !!userId,
  });

  // Query for user achievements
  const { data: userAchievements, isLoading: isAchievementsLoading } = useQuery({
    queryKey: ['/api/my-achievements'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/my-achievements');
      return res.json();
    },
    enabled: !!userId,
  });

  // Query for all possible achievements
  const { data: allAchievements, isLoading: isAllAchievementsLoading } = useQuery({
    queryKey: ['/api/achievements'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/achievements');
      return res.json();
    },
    enabled: !!userId,
  });

  const isLoading = isMetricsLoading || isRankLoading || isTeamLoading || isCompanyLoading || 
                   isAchievementsLoading || isAllAchievementsLoading;

  if (isLoading) {
    return (
      <div className="container py-10">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  // Filter earned achievements
  const earnedAchievementIds = userAchievements?.map((ua: UserAchievement) => ua.achievementId) || [];
  const earnedAchievements = userAchievements?.map((ua: UserAchievement) => {
    const achievementDetails = allAchievements?.find((a: Achievement) => a.id === ua.achievementId);
    return {
      ...achievementDetails,
      level: ua.level,
      earnedAt: ua.earnedAt
    };
  }) || [];
  
  // Filter unearned achievements
  const unearnedAchievements = allAchievements?.filter(
    (a: Achievement) => !earnedAchievementIds.includes(a.id)
  ) || [];

  return (
    <Layout>
      <div className="py-10">
        <h1 className="text-3xl font-bold mb-6">Productivity Dashboard</h1>
        
        {/* Performance Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard 
            title="Productivity Score" 
            value={metrics?.weeklyScore || 0} 
            icon={<TrendingUp className="h-5 w-5 text-primary" />} 
          />
          <StatCard 
            title="Tasks Completed" 
            value={metrics?.tasksCompleted || 0} 
            icon={<Trophy className="h-5 w-5 text-primary" />} 
          />
          <StatCard 
            title="Achievements" 
            value={earnedAchievements?.length || 0} 
            icon={<Award className="h-5 w-5 text-primary" />} 
          />
          <StatCard 
            title="Rank" 
            value={rankData ? `${rankData.rank}/${rankData.totalUsers}` : 'N/A'} 
            icon={<Medal className="h-5 w-5 text-primary" />} 
          />
        </div>
      
        {/* Tabs for Leaderboard and Achievements */}
        <Tabs defaultValue="leaderboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="achievements">Achievements</TabsTrigger>
          </TabsList>
          
          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Productivity Leaderboard</CardTitle>
                <CardDescription>
                  See how you compare to your team and the company
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="team">Team</TabsTrigger>
                    <TabsTrigger value="company">Company</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="team" className="space-y-4">
                    <div className="rounded-md border">
                      {/* Debug logs */}
                      {Array.isArray(teamLeaderboard) && teamLeaderboard.length > 0 ? (
                        teamLeaderboard.map((metric: any, index: number) => (
                          <UserScoreCard 
                            key={metric.userId || index} 
                            rank={index + 1} 
                            metric={metric} 
                            isCurrentUser={metric.userId === userId} 
                          />
                        ))
                      ) : (
                        <div className="p-4 text-center text-gray-500">
                          No team data available
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="company" className="space-y-4">
                    <div className="rounded-md border">
                      {/* Debug logs for company leaderboard */}
                      {Array.isArray(companyLeaderboard) && companyLeaderboard.length > 0 ? (
                        companyLeaderboard.map((metric: any, index: number) => (
                          <UserScoreCard 
                            key={metric.userId || index} 
                            rank={index + 1} 
                            metric={metric} 
                            isCurrentUser={metric.userId === userId} 
                          />
                        ))
                      ) : (
                        <div className="p-4 text-center text-gray-500">
                          No company data available
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Achievements Tab */}
          <TabsContent value="achievements" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Your Achievements</CardTitle>
                <CardDescription>
                  Track your progress and unlock new achievements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Earned Achievements</h3>
                  {earnedAchievements?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {earnedAchievements.map((achievement: any) => (
                        <AchievementBadge key={achievement.id} {...achievement} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">
                      You haven't earned any achievements yet. Complete tasks and stay productive to unlock them!
                    </p>
                  )}
                </div>
                
                <Separator className="my-6" />
                
                <div>
                  <h3 className="text-lg font-semibold mb-3">Achievements to Unlock</h3>
                  {unearnedAchievements?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {unearnedAchievements.map((achievement: Achievement) => (
                        <div key={achievement.id} className="opacity-50 grayscale transition-all hover:opacity-80 hover:grayscale-75">
                          <AchievementBadge {...achievement} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">
                      Congratulations! You've unlocked all available achievements.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}