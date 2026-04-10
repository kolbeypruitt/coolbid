"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEstimator } from "@/hooks/use-estimator";

export function CustomerDetailsStep() {
  const {
    customerName,
    jobAddress,
    customerEmail,
    customerPhone,
    projectName,
    setCustomerName,
    setJobAddress,
    setCustomerEmail,
    setCustomerPhone,
    setProjectName,
    nextStep,
  } = useEstimator();

  const canProceed = customerName.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canProceed) return;
    nextStep();
  }

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <CardTitle className="text-txt-primary">Customer details</CardTitle>
        <CardDescription className="text-txt-secondary">
          Capture this now while you&apos;re with the homeowner. You can edit it
          later if anything changes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customer_name">Customer name *</Label>
            <Input
              id="customer_name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Jane Doe"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job_address">Job address</Label>
            <Input
              id="job_address"
              value={jobAddress}
              onChange={(e) => setJobAddress(e.target.value)}
              placeholder="456 Elm St, Agra OK 74824"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer_email">Email</Label>
              <Input
                id="customer_email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_phone">Phone</Label>
              <Input
                id="customer_phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="(555) 000-0000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project_name">Project name (optional)</Label>
            <Input
              id="project_name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Defaults to the job address"
            />
          </div>

          <Button
            type="submit"
            className="bg-gradient-brand hover-lift w-full"
            disabled={!canProceed}
          >
            Continue to floorplan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
