# Deploying XRPL Node Infra in AWS
This repository contains the automation scripts for deploying the xrplnode Host operator on AWS using the Infrastructure as Code (IaC) approach with AWS CDK.

#### NOTE  
This module is responsible for setting up the necessary infrastructure resources but does not include automation for the xrplnode host configuration. In simpler terms, this module can prepare and allocate the necessary infrastructure, but it does not handle the automatic setup of the xrplnode host.


# The AWS infrastructure architecture for xrplnode Hosting on AWS
The following diagram illustrates how to host an xrplnode host node on Amazon Web Services (AWS).

![Alt Text](./xrpl-cdk-deployment/architecture/aws-host.drawio)


## Prerequisites
Before deploying to AWS, make sure you have completed the following steps:

1. You have an AWS account and have created AWS IAM Programmatic Access from your computer.
2. You have a public domain name created using AWS Route 53. docs.aws.amazon.com
3. AWS CLI is installed and configured with the Programmatic Access key created above. docs.aws.amazon.com  
4. Create a SSH Key pair from the AWS console for host access over SSH from your computer
4. NodeJS and AWS CDK tool is installed on your computer.

## Deployment 

1. Clone the repository 
2. Go to this path: cloud-infra-deployment-automation/aws/bin
3. Open xrplnodehost.ts file and modify the value according to your AWS environment: 
```typescript 
let variables = {
    ZONE_NAME: "HOSTED ZONE NAME", 
    ZONE_ID: "HOSTED ZONE ID", 
    OS_SPECIFICATION: {
      region: 'us-east-1', 
      image_id: "ami-053b0d53c279acc90" // This IMAGE ID will change on the AWS region that you're deploying from
    }, 
    ssh_key_name: "the ssh key name that you created as part of the pre-requisite steps", 
    DOMAIN_NAME: "xxx"
}
```

4. Once you finished adjusting, change the directory back to cloud-infra-deployment-automation/aws and run the follwoing command
```bash 
    $ npm install -g aws-cdk
    $ cd xrplnode-host/cloud-infra-deployment-automation
    $ npm install
    $ cdk synth
    $ cdk deploy
    

```
5. You should now have xrplnode host resources deployed 

6. Then, if no longer needed, to dispose of the xrplnode host resources afterwards
```bash 
    cdk destroy
```

## Disclaimer

This project is a personal project created by Ishwo. If you have found this repository, you are welcome to use it for your own purposes. However, please note that this project is provided "as is" and without any warranty. The author of this project cannot be held responsible for any damages or issues that may arise from the use of this code. Use it at your own risk.




