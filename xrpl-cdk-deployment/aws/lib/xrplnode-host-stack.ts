import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling'; 
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'; 
import * as iam from 'aws-cdk-lib/aws-iam';
import { PublicHostedZone, HostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget} from 'aws-cdk-lib/aws-route53-targets';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import { AutoScalingGroup, HealthCheck, BlockDeviceVolume} from "aws-cdk-lib/aws-autoscaling";
import {
  AmazonLinuxGeneration,
  // AmazonLinuxImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  SubnetType, 
  Vpc, 
  Peer, 
  Port, 
  SecurityGroup, 
  Instance, 
  GenericLinuxImage,
} from "aws-cdk-lib/aws-ec2";


export interface IStackProps extends cdk.StackProps {
  variables: any,
  env: cdk.Environment

}


export class XrplNodeHostStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IStackProps) {
    super(scope, id, props);

    // Set up vpc 
    const vpc = new Vpc(this, 'XrplNodeVpc', 
      {
        maxAzs: 2, 
        subnetConfiguration: [
          {
            cidrMask: 24, 
            name: 'XrplNodePublic', 
            subnetType: SubnetType.PUBLIC, 
          }, 
          {
            cidrMask: 24, 
            name: 'XrplNodePrivate', 
            subnetType: SubnetType.PRIVATE_ISOLATED
          },
        ],
      }
    );
  

    // Now let's set up dns record with existing domain name and integrate with load balancer 
    // Get the existing hosted zone
    const hostedZone = HostedZone.fromHostedZoneAttributes(this, 'XrplNodeHostHostedZone', {
      hostedZoneId: props.variables.ZONE_ID,
      zoneName: props.variables.ZONE_NAME,
    });
    // Request an ACM certificate
    const certValidation = new certificatemanager.Certificate(this, 'XrplNodeHostCertificate', {
      domainName: `*.${props.variables.ZONE_NAME}`,
      certificateName: 'XrplNodeHostCert', // Optionally provide an certificate name
      validation: certificatemanager.CertificateValidation.fromDns(hostedZone),
    });


    // Set up the firewall rules for Load Balancer 
    // Create a security group for ELB 
    const securityGroupELB = new SecurityGroup(this, 'XrplNodeHostELBSecurityGroup', {
      vpc: vpc,
      allowAllOutbound: true
    });

    // Add an ingress rule to allow port 443 from everywhere
    securityGroupELB.addIngressRule(Peer.anyIpv4(), Port.tcp(443), 'Allow port 443 from everywhere');
    // Set up the AWS Application LoadBalancer to loadblance and handle incoming traffics to backend XrplNode Host Service
    const lb = new elbv2.ApplicationLoadBalancer(this, 'XrplNodeHostLB', {
      vpc,
      internetFacing: true,
      loadBalancerName: "XrplNodeHostLB", 
      securityGroup: securityGroupELB,
    });

    // Create a LB listener with port 443 to handle inbound connection
    const listener = lb.addListener('Listener', {
      port: 443,
      open: true,
      certificates: [
        elbv2.ListenerCertificate.fromArn(certValidation.certificateArn)
      ],
    });
  
    // Set up Ubunutu Image
    let region = props.env.region;
    let machineImage: any = undefined;
    if (region == 'us-east-1') {
      machineImage = new GenericLinuxImage({
        'us-east-1': props.variables.OS_SPECIFICATION.image_id
      });
    } 
    else if (region == 'us-west-1') { 
      machineImage = new GenericLinuxImage({
        'us-west-1': props.variables.OS_SPECIFICATION.image_id
      });
    }
    else { 
      throw new Error("Currently only supported for US east and west aws regions");
    }


    // Set up Securit group at the instance level: 
    const XrplNodeHostNodeSecurityGroup = new SecurityGroup(this, 'XrplNodeHostNodeSecurityGroup', {
      vpc: vpc,
    });
    XrplNodeHostNodeSecurityGroup.addIngressRule(
      Peer.securityGroupId(securityGroupELB.securityGroupId), Port.allIcmp(), "Allow all tcp ports from the ELB Security group"
    )

    // Set up autoscaling to allow auto deployment of instances when load increase based on cpu load 
    const applicationAutoScalingGroup = new AutoScalingGroup(this, "AutoScalingGroup", {
      vpc: vpc,
      instanceType: InstanceType.of(
        InstanceClass.T3,
        InstanceSize.MEDIUM
      ),
      machineImage: machineImage,
      allowAllOutbound: true,
      maxCapacity: 2,
      minCapacity: 1,
      desiredCapacity: 1,
      spotPrice: "0.007", // $0.0032 per Hour when writing, $0.0084 per Hour on-demand
      healthCheck: HealthCheck.ec2(),
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED
      }, 
      blockDevices: [
        {
            deviceName: 'XrplNodeRootVolume',
            volume: BlockDeviceVolume.ebs(20, {
              volumeType: autoscaling.EbsDeviceVolumeType.GP3,
            }),
          },
      ],
      securityGroup: XrplNodeHostNodeSecurityGroup, 
      keyName: props.variables.ssh_key_name
    });
  
    applicationAutoScalingGroup.scaleOnCpuUtilization("CpuScaling", {
        targetUtilizationPercent: 90,
        cooldown: cdk.Duration.minutes(1),
        estimatedInstanceWarmup: cdk.Duration.minutes(1),
    });
    // Adding Target to backend XrplNode Instnace
    listener.addTargets('XrplNodeHostASGTargets', {
        port: 80,
        targetGroupName: "XrplNodeHostASGTargets", 
        targets: [applicationAutoScalingGroup]
      }
    );

    // Set up DNS record that puts the ELB created above 
    new ARecord(this, 'ARecord', {
      zone: hostedZone,
      recordName: `www.${props.variables.DOMAIN_NAME}.${props.variables.ZONE_NAME}`,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(lb)),
    });  



    // Set up Admin EC2 Instance to the XrplNode Instnace 
    // const securityGroupJumpHost = new SecurityGroup(this, 'securityGroupJumpHost', {
    //   vpc,
    //   description: 'Allow SSH access',
    //   allowAllOutbound: true,
    // });
    
    // securityGroupJumpHost.addIngressRule(
    //   Peer.anyIpv4(),
    //   Port.tcp(22),
    //   'Allow SSH access from anywhere',
    // );

    // // Now all this bastion host to talk to XrplNode host 
    // XrplNodeHostNodeSecurityGroup.addIngressRule(
    //   Peer.securityGroupId(securityGroupJumpHost.securityGroupId),
    //   Port.tcp(22),
    //   'Allow SSH access from anywhere',
    // );
    
    // const XrplNodeJumpHost = new Instance(this, 'XrplNodeJumpHost', {
    //   vpc,
    //   vpcSubnets: { subnetType: SubnetType.PUBLIC },
    //   instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
    //   machineImage: machineImage,
    //   securityGroup: securityGroupJumpHost,
    //   keyName: props.variables.ssh_key_name
    // });
   
  }
}
