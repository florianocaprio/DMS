import { useGetDashboardStats, useGetMyDashboardItems, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Files, FileText, CheckSquare, PenTool, ArrowRight, Clock, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { StatusBadge, PriorityBadge } from "@/components/shared/status-badges";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: items, isLoading: itemsLoading } = useGetMyDashboardItems();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back. Here is the overview of your document flows.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Protocols Today</CardTitle>
            <Files className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{statsLoading ? "-" : stats?.protocolsToday}</div>
            <p className="text-xs text-muted-foreground mt-1">
              +{stats?.protocolsThisMonth} this month
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
            <CheckSquare className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{statsLoading ? "-" : stats?.documentsInApproval}</div>
            <p className="text-xs text-muted-foreground mt-1">Documents awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Signatures</CardTitle>
            <PenTool className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{statsLoading ? "-" : stats?.pendingSignatures}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires your attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue Tasks</CardTitle>
            <AlertCircle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{statsLoading ? "-" : stats?.overdueTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">Past deadline</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Work Queue */}
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>My Tasks</CardTitle>
                <CardDescription>Your current assignments and upcoming deadlines.</CardDescription>
              </div>
              <Link href="/tasks" className="text-sm text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading tasks...</div>
              ) : items?.myTasks.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg bg-muted/30">
                  No pending tasks assigned to you.
                </div>
              ) : (
                <div className="space-y-4">
                  {items?.myTasks.map(task => (
                    <div key={task.id} className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors group">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{task.title}</span>
                          <PriorityBadge priority={task.priority} />
                        </div>
                        {task.protocolNumber && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Files className="w-3 h-3" /> Protocollo {task.protocolNumber}
                          </div>
                        )}
                        {task.documentTitle && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <FileText className="w-3 h-3" /> {task.documentTitle}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={task.status} />
                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Pending Signatures</CardTitle>
                <CardDescription>Documents requiring your digital signature.</CardDescription>
              </div>
              <Link href="/signatures" className="text-sm text-primary hover:underline flex items-center gap-1">
                Go to Signatures <ArrowRight className="w-4 h-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading signatures...</div>
              ) : items?.pendingSignatures.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg bg-muted/30">
                  No documents waiting for your signature.
                </div>
              ) : (
                <div className="space-y-4">
                  {items?.pendingSignatures.map(sig => (
                    <div key={sig.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <PenTool className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-medium">{sig.documentTitle}</div>
                          <div className="text-sm text-muted-foreground">Requested by {sig.requestedByName}</div>
                        </div>
                      </div>
                      <StatusBadge status={sig.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest events in your organization.</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading activity...</div>
              ) : (
                <div className="space-y-6">
                  {activity?.map((item, idx) => (
                    <div key={item.id} className="relative pl-6">
                      {idx !== activity.length - 1 && (
                        <div className="absolute left-2 top-6 bottom-[-24px] w-px bg-border"></div>
                      )}
                      <div className="absolute left-[3px] top-1.5 w-[10px] h-[10px] rounded-full bg-primary ring-4 ring-background"></div>
                      <div className="space-y-1">
                        <div className="text-sm">
                          <span className="font-medium text-foreground">{item.userName}</span>
                          {" "}
                          <span className="text-muted-foreground">{item.description}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(item.timestamp).toLocaleString()}
                        </div>
                        {item.protocolNumber && (
                          <div className="text-xs font-medium text-primary mt-1">
                            Prot. {item.protocolNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
